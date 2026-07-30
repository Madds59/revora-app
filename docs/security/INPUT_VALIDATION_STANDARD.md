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

### Residual, documented

The existing grammar has **no resource-id segment**, so a path cannot be bound to
one specific complaint or job. Cross-tenant use is fully blocked, but a caller
could still reuse one of *their own* business's uploaded objects across their own
resources. Closing that would require a path-grammar/migration change and is
recorded as a follow-up rather than silently changing the upload architecture.

**No evidence deletion or replacement action exists** anywhere in the codebase —
there is no Storage `.remove()` call at all — so there was nothing to harden on
that path. A regression test asserts none was introduced.

## Remaining boundaries (NOT covered by Phases 1–4A)

These external-input mutation boundaries still use ad-hoc validation and are the
scope of **Phase 4B+**:

- `(dashboard)/notifications/actions.ts`, `(admin)/admin/actions.ts`,
  `(onboarding)/onboarding/actions.ts`, and billing surfaces.
- `lib/vehicle-intelligence/actions.ts` `uploadVehicleMediaAction` is a **third
  instance of the same client-supplied-path pattern**, and additionally trusts a
  client `storage_bucket`, `customer_id` and `vehicle_id` with no ownership
  check. Severity is lower than the evidence paths because
  `vehicle_media_uploads.storage_path` is only rendered as text and never signed
  into a URL. **Adjacent finding — deliberately not fixed here** (it is a vehicle
  action file, outside this branch's scope); recommended for Phase 4B.
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

Because these remain, **APPSEC-09 is "Partially fixed — Phases 1, 2, 3 and 4A
complete", not fully closed.**

## Rollout plan

1. **Phase 1 (merged):** quotations, jobs, complaints (dashboard).
2. **Phase 2 (merged):** portal customer actions (complaint create/reply,
   quote approve/reject) + APPSEC-11 quote-detail ownership check.
3. **Phase 3 (merged):** customers, vehicles, business settings
   (profile/branches/services), invitations (payload only — **not** APPSEC-10
   expiry) and branding/logo storage-path verification.
4. **Phase 4A (this change):** evidence/attachment Storage-path ownership
   (`recordComplaintEvidence`, `uploadDocument`).
5. **Phase 4B:** notifications, admin, onboarding, billing, and the
   `uploadVehicleMediaAction` storage-path/ownership finding above.
4. Fold a "new server actions validate input via a `lib/validation` schema"
   item into [SECURITY_RELEASE_GATE.md](SECURITY_RELEASE_GATE.md) once coverage
   is broad.
