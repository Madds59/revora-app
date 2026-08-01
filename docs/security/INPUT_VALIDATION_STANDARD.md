# Input Validation Standard

Owner: AppSec Reviewer. Implements APPSEC-09 (see
[SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md) /
[APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md)). This standard defines how
externally supplied input to server mutations is validated. **Phase 1 covers
dashboard quotations, jobs, and complaints; Phase 2 covers the customer-portal
mutation actions; Phase 3 covers customers, vehicles and business settings;
Phase 4A covers evidence/attachment Storage-path trust boundaries**; later
phases extend it to the remaining boundaries.

## Architecture

- **Where:** validation runs at the **server-action boundary** (a Server Action
  or service function), never relying on client-side form validation. It runs
  *after* the auth/role/membership checks and *before* any Supabase mutation.
- **Library:** Zod (already a dependency, `^4.4.3`), matching the existing
  project convention (`lib/ratings.js`, `lib/retainer/retainer-schema.ts`,
  `lib/vehicle-intelligence/schemas.js`).
- **Layer:** `apps/web/src/lib/validation/`
  - `common.js` — reusable primitives: `uuid`, `optionalUuid`, `requiredText`,
    `optionalText`, `numberField`/`money`/`quantity`/`percentRate`, `enumOf`/
    `optionalEnumOf`, `optionalDateString`, and `firstValidationMessage`.
  - `quotations.js`, `jobs.js`, `complaints.js` — per-action `z.object` schemas
    plus exported enum allowlists.
  - Authored as **`.js` (ESM)** so the same schemas run in the `.ts` Server
    Actions *and* in the offline `node --test` suite.
- **Pattern in an action:**
  ```ts
  const parsed = someSchema.safeParse({ field: formData.get("field"), … });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { field } = parsed.data; // normalized, typed
  ```

## Normalization rules (evidence-based only)

- **Identifiers** — required fields must be well-formed UUIDs; blank/malformed is
  rejected. `business_id` is **derived from the session/membership, never taken
  from client input** (RLS remains the backstop). Enum values come from the
  Postgres enums (`item_kind`, `product_category`, `job_status`,
  `complaint_status`, `complaint_severity`).
- **Strings** — trimmed; required fields rejected if empty after trim; Unicode
  and **Arabic** content preserved verbatim (no destructive sanitization).
  Length caps are generous anti-abuse guards aligned with the existing
  precedent (`ratings` review `.max(1000)`), chosen not to reject legitimate
  content — not tight business limits.
- **Numbers/money** — parsed explicitly; NaN, ±Infinity, and (by default)
  negatives are rejected rather than silently defaulted; bounds follow the
  `numeric(12,2)` / `numeric(5,2)` column precision (`tax_rate` treated as a
  0–100 percentage). Blank falls back to the field's existing default (e.g.
  quantity → 1), preserving current quotation-calculation behavior.
- **Dates** — parseability is validated and impossible dates rejected; the
  original trimmed string is passed through unchanged (no reformatting), so
  timezone/storage behavior is preserved.
- **Collections** — quotation line items are validated field-by-field
  (kind/category enums, quantity, unit price, discount, tax, description).

## Safe error-response policy

- On validation failure the action returns its existing contract
  (`{ error: string }`) with a **curated, user-safe message** (e.g. "Please
  select a valid customer.", "Quantity cannot be less than 0."). Every message
  is authored in this layer.
- **Raw Zod issue objects, schema field names, and `.flatten()` output are never
  returned to users.** `firstValidationMessage` extracts only the first curated
  message string (with a length guard) and otherwise falls back to a generic
  "Please review the information you entered and try again."
- Unexpected DB/SDK failures continue to be handled per **APPSEC-07**: logged
  server-side via `console.error`, generic message to the user.
- Messages for the targeted dashboard actions are plain English, matching those
  files' existing convention (they did not use next-intl for action errors).

## Actions covered (Phase 1)

| Domain | Action | Type | Validated |
|---|---|---|---|
| Quotations | `createQuote` | create | customerId (uuid), vehicleId (opt uuid) |
| | `addItem` | update | quotationId, name, kind/category enums, quantity, unit price, discount, tax rate, description + transparency text |
| | `removeItem` | delete | itemId, quotationId (uuids) |
| | `updateQuoteDetails` | update | id, expected-completion date, warranty/customer/internal notes |
| | `sendQuote` | status transition | id (uuid) |
| | `approveQuote` | create (customer approval) | quotation/business/customer ids, version, language, signature, note |
| Jobs | `updateJobStatus` | status transition | id, status enum |
| | `postJobUpdate` | update (+opt status) | jobId, message, optional status enum |
| | `addJobTask` | create | jobId, title, description |
| | `toggleJobTask` | update | id, jobId (uuids) |
| Complaints | `updateComplaint` | update/status | complaintId, status/severity enums, assignee (uuid), resolution summary |
| | `addComplaintMessage` | create | complaintId, body, parentMessageId; **business_id session-derived** |

## Tests added

`apps/web/tests/input-validation.test.mjs` (17 tests): common primitives
(malformed UUID, blank-after-trim, Arabic acceptance, NaN/Infinity/negative,
unknown enum, safe-message extraction), per-domain valid/invalid payloads, and
security regressions (client `business_id` is dropped by the schema and the
complaints action uses `business_id: business.id`; all three actions call
`safeParse` + `firstValidationMessage`).

## Actions covered (Phase 2 — customer portal)

| Action | Validated | Identity + ownership |
|---|---|---|
| `createComplaint` | account selector ids (uuids), subject, description, severity enum (blank → `medium`) | mutation uses the **session-resolved account row** (`requireCustomerPortal()` accounts); client ids only select among the user's own linked accounts |
| `addComplaintReply` | complaintId, businessId (shape only), body, parentMessageId | **explicit ownership query**: complaint fetched and matched against session accounts before insert; insert identity comes from the verified complaint row |
| `approveQuote` | reuses Phase 1 `approveQuoteSchema` (ids, version, language, signature, note) | **explicit ownership + state query**: quotation must belong to the session account, be `status = 'sent'`, and match `current_version`; approval row identity comes from the verified quotation row |
| `rejectQuote` | new `rejectQuoteSchema` (ids, optional rejection note) | same ownership + `'sent'`-state query; RPC receives session-derived ids only |

Portal identity policy: client `customer_id`/`business_id` are **account
selectors, never identity sources** — every mutation writes values from the
session-derived account row or the ownership-verified target row. Ownership
failures return a **non-enumerating** "not found or unavailable" message (a
customer cannot distinguish another tenant's resource from a nonexistent one).
RLS (`complaint_messages_customer_insert`, `approvals_customer_insert`,
`customer_reject_quote` SECURITY DEFINER) remains the mandatory backstop. The
portal quote detail page also carries the complaint-page-style explicit
ownership check (closes APPSEC-11).

Tests: `apps/web/tests/portal-input-validation.test.mjs` (behavioral schema
tests for all four payloads incl. Arabic content, plus static regression
assertions that the safeParse/ownership/non-enumeration patterns stay present).
Runtime cross-customer denial is covered by manual/local QA
([SECURITY_QA_TEST_PLAN.md](SECURITY_QA_TEST_PLAN.md)); no hosted-Supabase
integration test is run in CI.

## Actions covered (Phase 3 — customers, vehicles, business settings)

| Action | Validated | Identity + ownership |
|---|---|---|
| `createCustomer` | name, phone, email, language enum (blank → `en`) | `business_id`/`created_by` session-derived |
| `updateCustomer` | same + customer id | **added explicit `business_id` scoping** to the update (previously RLS-only) + non-enumerating miss |
| `createVehicle` | customer selector, make/model/plate/VIN/colour, year | customer must resolve to a live customer of the session business |
| `updateVehicle` | same + vehicle id (customer selector optional) | vehicle fetched under session business; relink target re-verified |
| `updateBusiness` | name, legal name, tagline, country, default language | target is `business.id` from the session |
| `addBranch` | name, phone, email | `business_id` session-derived |
| `addService` | name, description, default price | `business_id` session-derived |
| `inviteTeammate` | email (lowercased), role allowlist | `business_id`/`invited_by` session-derived |
| `revokeInvitation` | invitation id | **added explicit `business_id` scoping** (previously RLS-only) |
| `uploadBusinessLogo` | object path, file name, MIME, size | **path verified to sit in `<business.id>/branding/…`** |

Phase 3 normalization rules and the evidence behind them:

- **Email** — pragmatic shape check only, never a deliverability claim. Case is
  preserved for customers/branches (that surface never lowercased); invitation
  emails are still lowercased because the pending-invite unique index depends on
  it.
- **Phone** — country-agnostic. International notation (`+`, spaces, dashes,
  parentheses, dots, slashes) is preserved verbatim, values are never coerced to
  numbers (leading zeros survive), and only digit-less/overlong/garbage input is
  refused. No single country format is imposed.
- **Language** — `customers.preferred_language` IS allowlisted (`en`/`ar`)
  because the form is a two-option Select. `businesses.country` /
  `default_language` are **not** allowlisted: they are free-text inputs over
  `text not null default` columns with no CHECK constraint, so they are validated
  as bounded text with the existing defaults (`AE`/`en`) preserved. Imposing a
  locale/currency allowlist there would reject values the product accepts today.
- **Vehicles — no invented specifications.** Validation is structural only.
  make/model/colour/plate stay free text (regional plate formats intact), and
  **VIN is not format-checked**: `vehicles.vin` is plain `text` with no existing
  rule, so only a generous length cap applies. The VIN validator in
  `lib/vehicle-intelligence/vin.js` belongs to the decode feature and is
  deliberately not imposed here — nothing is decoded, inferred, or enriched.
- **Year** — mirrors the action's pre-existing `parseYear` rule (1900 … current
  year + 1) rather than inventing a range; blank still clears the field.
- **Money** — `services.default_price` stays nullable: blank persists `null`,
  non-blank must fit `numeric(12,2)` under the same money rule the quotation
  schemas use.
- **Invitation roles** — strictly `manager` / `employee`. `super_admin`,
  `business_owner` and `customer` are refused even though they exist in the
  `member_role` enum.
- **Logo/storage** — the browser uploads directly to Storage (constrained by the
  `revora_public_insert` policy) and hands back a path, so that path is untrusted
  input. The action now requires an `image/*` MIME and a positive integer size
  (zero-byte rejected), and verifies the path is exactly
  `<authenticated business id>/branding/<safe file>` — traversal, absolute paths,
  backslashes, extra segments and cross-tenant namespaces are all rejected.

Privacy: validation messages never echo submitted personal values, ownership
misses use non-enumerating "not found or unavailable" text, and unexpected
failures keep the APPSEC-07 pattern (server-side `console.error`, generic user
message) without logging contact details or file contents.

Tests: `apps/web/tests/customer-input-validation.test.mjs`,
`vehicle-input-validation.test.mjs`, `business-settings-validation.test.mjs`
(behavioral schema tests incl. Arabic content, plus static regressions pinning
safeParse/session-scoping/ownership patterns and asserting no invitation-expiry
implementation). Local-only Supabase QA additionally proved cross-business
customer/vehicle/settings/invitation writes are denied while same-business
writes succeed ([SECURITY_QA_TEST_PLAN.md](SECURITY_QA_TEST_PLAN.md)).

## Actions covered (Phase 4A — evidence / attachment Storage paths)

### Why this phase mattered more than defence-in-depth

Private files are read back through `lib/storage.ts` `signedUrl()`, which signs
with the **service role and therefore bypasses Storage RLS**. Recording a
client-supplied `object_path` that points at another tenant's namespace would
have produced a *working signed URL for that tenant's private file*. Local QA
confirmed the gap empirically: calling `record_complaint_evidence` directly with
a cross-tenant path stored the row without complaint, because the RPC validates
*who may attach to the complaint* but never validates the path itself.

### Path grammar (from migration 0016 + `components/file-upload.tsx`)

```
<business_id>/<entity>/<uuid>-<safe-name>      exactly three segments
```

Namespaces in use: `complaint-evidence`, `job-photos`, `documents` (private
bucket) and `branding` (public bucket, hardened in Phase 3).

`parseOwnedStoragePath()` in `lib/validation/evidence.js` returns the **verified
components** `{ businessId, entity, objectName }` rather than a boolean, and the
actions rebuild the stored path from those components so the raw client string is
never persisted. It compares the tenant segment by **exact equality** (never
`startsWith`/`includes`, so `<business-id>-evil/…` fails) and rejects wrong
namespaces, traversal, absolute paths, trailing/leading slashes, double slashes,
empty/extra/missing segments, backslashes, control characters and NUL, unsafe
object names, and malformed business UUIDs.

| Action | Validated | Identity + ownership |
|---|---|---|
| `recordComplaintEvidence` (`lib/evidence-actions.ts`) | complaint id, object path, file name, MIME, size, description | session required; the complaint is re-read under the caller's own RLS (`complaints_access` covers staff **and** the linked customer) and its `business_id` pins the path before the SECURITY DEFINER RPC is called |
| `uploadDocument` (`lib/document-actions.ts`) | object path, file name, MIME, size, document type, title, link ids | `business_id` from `requireMembership()`; path pinned to that business and the `job-photos`/`documents` namespaces; **every supplied link (customer/quotation/complaint/job) is ownership-checked** before insert |

### SECURITY DEFINER review

`record_complaint_evidence` derives the business from the complaint row, checks
`is_business_member` OR `is_customer_for_business`, and sets `uploaded_by` from
`auth.uid()` — its *authorization* is sound and remains the backstop. Its gap is
that `p_object_path` is trusted verbatim. **The RPC itself was NOT changed** —
the active application path is fully mitigated caller-side, so **no migration is
required**; tightening the RPC to validate the path prefix would be a
defence-in-depth follow-up, not a prerequisite.

One further privileged RPC accepts a signature object path:
`record_approval_with_signature` (migration 0018). It is **dormant — not invoked
anywhere in application code** (verified by search), so it presents no reachable
application path today and was deliberately left untouched: no dormant-code
cleanup was folded into this phase. If it is ever wired up, it must receive the
same caller-side path pinning before use.

### File metadata

`sizeBytes` must be a positive integer (zero-byte and malformed sizes rejected);
**no maximum is imposed — Revora still has no product-wide upload-size policy and
this phase deliberately did not invent one.** `mimeType` is shape-checked only:
no evidence MIME allowlist exists today (the documents uploader accepts any
type), and a declared MIME is never treated as proof of file content — **content
is not inspected**. `fileName` is display metadata only, bounded and stripped of
path separators and control characters; it is never used as the Storage key.

### Corrective pass: read-time authorization and resource binding

The first cut of Phase 4A only protected **new writes**. A pre-merge review found
two gaps, both since closed:

1. **Legacy stored paths.** Rows written before this branch may already hold a
   cross-tenant path, and the read path signed whatever was stored — all three
   service-role signing sites (`lib/evidence.ts`, `lib/documents.ts`, the portal
   documents page) passed `media.object_path` straight to `signedUrl()`. Row
   visibility is not path authorization.
2. **Same-business cross-customer reuse.** The three-segment grammar bound a path
   to a business but not to a resource, so customer A2 could attach A1's object
   to A2's own complaint and have it signed for them.

**Read-time guard.** `signOwnedStorageObject()` (`lib/storage.ts`) is now the only
sanctioned way to sign a stored path. It calls
`authorizeStoredPathForSigning()` first and signs **only** the canonical path
rebuilt from verified components. Every authorization input comes from the
server-verified row (`complaint_evidence.business_id`/`complaint_id`,
`documents.business_id`/`job_id`), never from the request. Denials return `null`
so the gallery degrades to "no link", and log a stable code
(`path_unverified` / `legacy_unbound_customer`) — never the path, filename, or
provider error. `signedUrl()` itself now carries an explicit warning not to call
it with a database value.

**Resource-bound (v2) grammar**, used for all new writes into a namespace that
has exactly one owning resource:

```
<business-id>/<namespace>/<resource-id>/<object-name>
```

The Storage policies authorize on `split_part(name, '/', 1)` only, so the extra
segment needs **no policy or migration change**. `RESOURCE_BOUND_NAMESPACES` maps
`complaint-evidence → complaint` and `job-photos → job`; the uploader emits the
four-segment key whenever a `resourceId` is supplied. `recordComplaintEvidence`
requires the path's resource segment to equal the ownership-verified complaint,
and `uploadDocument` requires it to equal the ownership-verified job (link
ownership is now checked *before* the path is bound, because the verified job id
is what the path must match).

**Legacy compatibility policy.** Existing three-segment objects in a
resource-bound namespace carry no proof of which resource or customer they belong
to. They must still pass exact business **and** namespace checks, and then:

- **staff** may view them (staff access is business-wide under the existing
  model, so business+namespace is exactly the authorization staff already have);
- **portal customers fail closed** — such objects return no link and require
  reattachment or administrative remediation.

No stored path was migrated or rewritten.

### Residual, documented

The **standalone documents uploader has no single owning resource** (it binds no
job/customer/quotation at all), so objects in the `documents` namespace remain
business-scoped three-segment paths by design — not "legacy".

Because business + namespace would otherwise mean "any object in this tenant's
document namespace", a portal customer is **not** given such a path on those
grounds alone. The guard requires the caller to pass `ownershipProven: true`,
which the portal documents page derives by checking the row's `customer_id`
against the session's own customer accounts. Without that explicit proof the
guard **fails closed** (`unbound_customer_unproven`) and the signer is never
invoked; the guard never infers ownership, and proof never rescues an otherwise
invalid path. Staff are unaffected: business + namespace is exactly the
business-wide access they already hold.

Fully binding these objects would require a server-authorized upload-intent
design, which is recorded as follow-up work rather than pretending namespace
validation is resource binding.

**No evidence deletion or replacement action exists** anywhere in the codebase —
there is no Storage `.remove()` call at all — so there was nothing to harden on
that path. A regression test asserts none was introduced.

## Release rule: stored values are untrusted at privileged boundaries

**Database-stored values must be revalidated immediately before they are passed
into service-role clients, privileged RPCs, signed-URL generators, Storage
mutations, or any other authorization-bypassing operation.** A row being visible
to the caller is not an authorization decision about the value inside it.

This applies to values flowing from a database row into `createAdminClient()`,
service-role Storage clients, `createSignedUrl`, Storage
`upload`/`download`/`remove`/`copy`/`move`, `SECURITY DEFINER` RPCs, external API
calls, object-key operations, and anything rendered as an active URL or redirect.

Approved guards today: `signOwnedStorageObject()` /
`authorizeStoredPathForSigning()` for evidence and documents, and
`authorizeStoredVehicleMediaPath()` for vehicle media.

Regression coverage is an **explicit registry**, not a repo-wide regex:
`tests/vehicle-media-security.test.mjs` enumerates the known vehicle-media
readers and fails if one performs a privileged Storage operation without calling
the guard, or renders a stored path into `src`/`href`/background/`srcSet`.
**Honest limitation:** the registry only covers the call sites listed in it, so
new privileged consumers must be added deliberately — the rule above is what
governs new code.

## Actions covered (Phase 4B — vehicle media)

`uploadVehicleMediaAction` (`lib/vehicle-intelligence/actions.ts`) previously
persisted a **client-chosen Storage bucket**, a **client-chosen object path**, an
**unverified `vehicle_id`**, and an **unverified `customer_id`** — so a member of
one business could record media against another tenant's vehicle, and attach an
arbitrary customer.

**Severity was verified, not assumed.** Every reader of `vehicle_media_uploads`
was traced: the dashboard and portal vehicle detail pages both render
`storage_path` as escaped JSX text. There is **no** service-role client,
signed-URL generator, Storage download/remove, AI-provider call, or active URL
consuming these columns today, so this is a **write-boundary fix** — but an
unvalidated path stored now becomes a privileged-boundary problem the moment a
reader starts signing it, which is exactly how the Phase 4A evidence issue arose.

| Concern | Before | Now |
|---|---|---|
| Bucket | client-supplied, persisted | server constant `revora-private`; the posted value is not even read |
| Path | client-supplied, persisted raw | pinned to verified business **and** vehicle, persisted as a canonical rebuild |
| Vehicle | client selector, unverified | resolved under the authenticated business; a miss returns the non-enumerating "Vehicle media target not found or unavailable." |
| Customer | client selector, persisted | taken from the verified vehicle row; a submitted id may only *confirm* it, mismatches are refused |
| Media type | cast to a union, unchecked | allowlisted against the `vehicle_media_uploads_media_type_check` constraint |

Path grammar, taken from `components/vehicle-media-upload.tsx` (which passes
`entity="vehicles/<vehicleId>/media"` into the shared uploader):

```
<business-id>/vehicles/<vehicle-id>/media/<object-name>      five segments
```

The Storage policies authorize on `split_part(name, '/', 1)` only, so this
deeper grammar needs **no policy or migration change**. Size/MIME/filename follow
the Phase 4A rules (positive integer, no invented maximum, MIME shape-checked
with no content inspection, filename display-only). No VIN decoding or
specification enrichment occurs in this path. The stored path is also no longer
echoed into the AI tool-call audit payload.

### Privileged-boundary inventory (repository-wide)

`createAdminClient()` call sites and their classification:

- `lib/storage.ts` — signed URLs and public logo URLs: **guarded** (Phase 3/4A).
- `(portal)/portal/actions.ts` — notification-event insert with session-derived
  identity: **safe constants/session input**.
- `lib/notifications/service.ts` (×6) — **fixed in Phase 4C** (see below).
- `lib/actions/launch-ops.ts`, `lib/stripe-webhook.ts` — still **out of scope**;
  both consume stored rows at a privileged boundary and remain separately scoped
  findings, unchanged by this branch.

## Actions covered (Phase 4C — notification service)

`lib/notifications/service.ts` is the product's largest privileged surface: it
runs entirely on `createAdminClient()` (service role) and takes its work from the
`claim_queued_notification_events` SECURITY DEFINER RPC. **Six** service-role
functions were reviewed — `queueCustomerNotification`,
`processQueuedNotifications`, `enqueueQuoteSentNotification`,
`enqueueQuoteDecisionNotification`, `enqueueJobStatusNotification`,
`enqueueComplaintStatusNotification` — confirming the reported inventory.

### The gap this closes

The claim RPC selects rows by channel/status/schedule only. It does not prove a
row is correctly scoped, and it returns whatever `recipient_email`,
`recipient_phone`, `channel`, `template_key`, `locale` and `payload` the row
carries. The dispatcher previously **addressed messages using those stored
columns**, coerced any non-`sms` channel to `email`, and fell back to a generic
message for unregistered templates. A row that was poisoned by any future write
path — or merely stale after a customer changed address or was reassigned —
would have been delivered verbatim. This is the same principle established in
Phase 4A: data that has crossed into the database is still untrusted when it
crosses back out through a privileged boundary.

### Queue time

`queueCustomerNotification` now `safeParse`s its input
(`queueCustomerNotificationSchema`), then persists **only verified values**:
`business_id`/`customer_id` come from the rows loaded by `loadCustomerContext`
(which loads the customer *under* the business, proving the relationship), never
from the caller's selectors. The template key must be in the registry, channels
are filtered to the dispatchable set, the dedupe key is bounded and
control-character free, and the payload is rebuilt through
`persistablePayloadSchema` so unknown caller keys — a signed URL, Storage path,
redirect URL, API key or customer note — are **stripped rather than stored**.
Template variables accept bounded scalars only.

### Dispatch time

`authorizeEventForDispatch()` runs before any provider call and re-proves, from
freshly loaded rows: the business exists and matches the event; the customer
exists, matches, and belongs to that business; the payload's source resource
belongs to the same business (and customer, where both name one — one extra
scoped query per event, since the claim RPC does not return it); the channel is
dispatchable; the template is registered; the payload parses; and the attempt
count is within bounds. **The destination is re-derived from the verified
customer** — the stored `recipient_email`/`recipient_phone` columns are
deliberately ignored for addressing. Locale follows the verified customer and
normalizes to `en`/`ar`.

Denials fail closed with a stable code (`business_unverified`,
`customer_unverified`, `customer_business_mismatch`, `source_unverified`,
`channel_not_dispatchable`, `template_unknown`, `payload_invalid`,
`recipient_unresolved`, `attempts_exhausted`, `event_malformed`), write a
privacy-safe attempt row, and move the event to a terminal status so it cannot
spin in the queue.

### Channels, templates, state and retries

Only `email` and `sms` are dispatchable — matching the claim RPC's own filter.
`push` remains the in-app notification centre and is never sent to a provider;
the `notification_channel` enum's social values are not implemented and none
were invented. Attempt counts are clamped (`MAX_ATTEMPTS`), so a poisoned counter
cannot run away and exhausted events stop retrying. Terminal updates are guarded
on `status = 'processing'`, so a row that was not legitimately claimed is never
transitioned, and `locked_until` is cleared on **every** handled path — including
the batch's catch, which now releases a throwing row instead of leaving it locked
until expiry. Idempotency is unchanged: the `(business_id, dedupe_key)` unique
index plus `ignoreDuplicates` upsert.

### Delivery privacy and live-send

Raw provider responses are never stored or logged. `normalizeProviderFailure()`
reduces them to stable categories (`provider_auth`, `provider_rate_limited`,
`provider_unavailable`, `provider_rejected`, `provider_timeout`,
`provider_unknown`) and provider message ids are bounded opaque handles. Attempt
rows keep only operational fields — no destination, no rendered content, no
provider body. Logs carry stable codes only.

**Live delivery remains disabled by default and was not changed.** Sending still
requires `NOTIFICATIONS_DISPATCH_ENABLED`, `NOTIFICATIONS_LIVE_SEND_ENABLED` and
the per-business `live_send_enabled` flag; the gate is consulted before any
provider call, and a regression test asserts that ordering.

### Local runtime QA (environment gap closed)

The first Phase 4C pass reached only **11 of 12** cases because the local
Supabase stack predated migration `0030` — `notification_events` had no
`dedupe_key`/`attempt_count`/`locked_until`, and
`claim_queued_notification_events` did not exist locally — so idempotency and
claim/lock semantics rested on schema review plus unit tests.

That gap is now closed. Migration `0030` was applied in place to the local-only
Docker stack (additive DDL; **no migration file was created or modified**, and no
hosted project was contacted), putting the local ledger at exact parity with
`supabase/migrations`. **23 of 23** runtime cases then passed against the real
claim RPC and the shipped `authorizeEventForDispatch`: dedupe-key idempotency via
the unique index, claim eligibility (`push` never claimed), lock acquisition and
release, `attempt_count` increment and clamping to `MAX_ATTEMPTS`, poisoned
stored `recipient_email`/`recipient_phone` ignored with the destination
re-derived from the verified customer, cross-business/cross-customer/unknown
template/malformed payload denials, a throwing row released rather than left
locked without ending the batch, terminal rows never re-claimed, and
privacy-safe attempt rows. `fetch` was replaced by a tripwire for the whole run
and recorded **0** provider invocations; every allowed row settled as
`skipped_disabled`. Disposable rows were deleted afterwards.

Still not covered locally: hosted Supabase behaviour and any real provider
delivery — neither was contacted, by design.

## Phase 4D — platform-administration mutations

`/admin` is the product's only **global** authority surface: a verified platform
administrator acts across every tenant, unscoped by business membership. The
inventory found the authorization model already sound, and it was preserved
rather than rewritten:

- **Canonical authority** is `requireSuperAdmin()` (`lib/auth.ts`), which resolves
  the actor from the **server session** and checks the `platform_admins` table by
  `user_id = user.id`. It consults no `account_intent`, no profile display role,
  no `user_metadata`/`app_metadata`, no form field, no query parameter, and no
  email domain. Unauthenticated callers redirect to `/login`; authenticated
  non-admins redirect to `/`. Both redirects **throw**, so invoking a server
  action directly cannot proceed past the guard — layout protection is not the
  control.
- **Defence in depth at the database**: all 14 `admin_*` RPCs are SECURITY
  DEFINER and re-check `is_super_admin()` themselves, so even a caller reaching
  PostgREST directly is denied. `admin_set_super_admin` additionally refuses
  self-revocation.
- **No service role anywhere in `/admin`** — every admin page and action uses the
  RLS-scoped client and reaches privileged data only through those RPCs. This is
  a materially stronger arrangement than the Phase 4A–4C surfaces and was left
  intact.

What was missing was the *other* half of this standard — strict parsing of the
administrator's own input. Global authority does not make a malformed or
ambiguous instruction safe; an administrator is still an external input source.

**Defect fixed (highest impact):** the super-admin grant/revoke direction came
from a hidden form field evaluated as
`String(formData.get("make_admin") ?? "true") === "true"`. An **absent** field
therefore meant **GRANT**, and any unrecognised string silently meant revoke. The
new `adminIntent` schema requires the literal `"true"` or `"false"`; anything
else — including absent — is rejected, so the operation fails closed toward *no
privilege change*.

**Also fixed:** `setSuperAdmin` now validates the target email (bounded to 320
chars, control-character free, plausible shape, trimmed — and the trimmed value
is what the confirmation echoes); `markNotificationRead` requires a real UUID, so
a malformed selector fails as validation rather than as a database cast error;
both actions log `error.code` only; and the five admin list pages bound their own
`pageSize` via `parseAdminPageSize` (previously `Number(raw) || 25`, which
accepted `1e9` and negative values, producing a negative offset and nonsense page
counts — the RPCs already clamp to 100, so this is defence in depth).

Schemas live in `lib/validation/admin.js`, with `ADMIN_MUTATION_REGISTRY` acting
as the explicit call-site registry (the Phase 4B pattern: an explicit list, not a
repo-wide regex that would go green by accident).

**Known limitation — see APPSEC-12:** `platform_admins` has no audit trigger, so
grant/revoke leaves no history. Fixing that requires a migration or an RLS change
and was therefore out of scope for this branch; it is documented in the register
with severity and a recommendation rather than silently worked around.

## Remaining boundaries (NOT covered by Phases 1–4D)

These external-input mutation boundaries still use ad-hoc validation and are the
scope of **Phase 4E+**:

- `(dashboard)/notifications/actions.ts`, `(onboarding)/onboarding/actions.ts`,
  and billing surfaces. (`(admin)/admin/actions.ts` — **fixed in Phase 4D**, see
  above.)
- `lib/vehicle-intelligence/actions.ts` `uploadVehicleMediaAction` — **fixed in Phase 4B** (see above).
- No maximum upload size is defined anywhere in the product; Phases 3 and 4A
  reject zero-byte/garbage sizes but do not invent a cap. Upload-size governance
  remains an open product-security decision.
- Portal `saveBusinessRating` already validates via Zod
  (`businessRatingInputSchema`) and checks the session account pair — reviewed
  in Phase 2, no change needed.
- Note: `lib/actions/retainer-scenarios.ts` and `lib/actions/membership-bundles.ts`
  already validate via Zod (`retainerScenarioSaveSchema`, `bundleDraftSchema`).
- The customer surface has **no** archive/restore/merge/note mutation actions
  today (soft-delete columns are read-filtered only), so none were added.

Because these remain, **APPSEC-09 is "Partially fixed — Phases 1, 2, 3, 4A, 4B
and 4C complete", not fully closed.**

## Rollout plan

1. **Phase 1 (merged):** quotations, jobs, complaints (dashboard).
2. **Phase 2 (merged):** portal customer actions (complaint create/reply,
   quote approve/reject) + APPSEC-11 quote-detail ownership check.
3. **Phase 3 (merged):** customers, vehicles, business settings
   (profile/branches/services), invitations (payload only — **not** APPSEC-10
   expiry) and branding/logo storage-path verification.
4. **Phase 4A (this change):** evidence/attachment Storage-path ownership
   (`recordComplaintEvidence`, `uploadDocument`).
5. **Phase 4B (merged):** `uploadVehicleMediaAction` storage-path/ownership.
6. **Phase 4C (this change):** notification service — queue-time validation and
   dispatch-time revalidation of claimed rows at the service-role boundary.
7. **Phase 4D:** admin, onboarding, billing. `lib/actions/launch-ops.ts` and
   `lib/stripe-webhook.ts` remain separately scoped privileged-boundary work.
4. Fold a "new server actions validate input via a `lib/validation` schema"
   item into [SECURITY_RELEASE_GATE.md](SECURITY_RELEASE_GATE.md) once coverage
   is broad.
