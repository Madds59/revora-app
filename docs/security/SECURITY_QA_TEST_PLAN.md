# Security QA Test Plan

Owner: QA/Security Tester. Test runner: Node's built-in `node:test`, invoked via
`pnpm test` (`node --test tests/*.test.mjs`) from `apps/web`. A local Supabase
stack was confirmed reachable at `127.0.0.1:54321` during Phase 10 validation of
the original pass (`scripts/e2e.mjs` successfully signed up a real test user and
ran 14 live RLS checks) — this superseded an earlier, incorrect assumption that
Docker wasn't installed on this machine. `pnpm test` itself still runs fully
offline (see §5); the live-RLS coverage lives in `scripts/e2e.mjs`, run via
`pnpm smoke:routes`, not in the `node:test` suite.

## 1. What's Already Automated (found in `apps/web/tests/` before this pass)

| File | Covers |
|---|---|
| `auth-links.test.mjs` | Locale-aware auth route path building (login/signup/forgot-password/reset-password) |
| `notifications.test.mjs` | Template rendering, UUID redaction, no-op provider resolution without env config, three-layer live-send gating, migration structure (dedupe/queue-claim SQL) |
| `vehicle-intelligence.test.mjs` | VIN validation, critical-symptom safety classification, dangerous self-check step removal, DTC interpretation, diagnostic JSON schema validation, search helpers |
| `billing-summary.test.mjs`, `ratings.test.mjs`, `retainer-calculator.test.mjs`, `membership-bundles.test.mjs`, `launch-ops.test.mjs`, `locale-path.test.mjs` | Domain logic for their respective features (not security-focused, but contribute to overall correctness) |

This is solid coverage for **pure-function logic** (template rendering, safety
classification, gating logic). It does not, and cannot without a live database,
exercise **RLS enforcement itself** — that requires an actual Postgres connection
with the policies applied.

## 2. New Automated Coverage Added in This Pass

`apps/web/tests/security-regressions.test.mjs` (added alongside the Phase 9 fix) —
static, text-based regression guards requiring no live services, no secrets, and
no network calls, following the same pattern `notifications.test.mjs` already uses
for asserting on migration SQL text:

1. **`account_intent` never appears in any RLS-policy-bearing migration** —
   guards the program's single most important non-negotiable (APPSEC-02): that
   onboarding metadata is never promoted into an authorization check at the
   database layer.
2. **All 21 of the fully-cleaned files fixed for APPSEC-07 no longer contain the
   raw `error: error.message` / `error?.message ??` leak pattern** — regression
   guard so a future edit can't silently reintroduce raw DB error leakage. Covers
   server actions and `lib/` service functions across the action/mutation layer
   (see [APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md) APPSEC-07 for the full
   22-file list — 21 are covered by this exact-match test; `onboarding/actions.ts`
   is excluded because it has one deliberately-kept Supabase Auth SDK message).
3. **No `page.tsx` anywhere under `app/` renders a raw query error in JSX**
   (APPSEC-07b) — unlike the APPSEC-07 test above, this is a tree-wide,
   pattern-based scan (not a closed file list), so it also catches the same
   mistake in any future page, not just the 20 files fixed in the APPSEC-07b
   pass. Checks for `{xError.message}`-style JSX, `String(error)`/
   `JSON.stringify(error)` stringification, and `${error}` template-literal
   interpolation, with `(auth)/**` excluded (documented Auth SDK exception, see
   APPSEC-08). Verified to actually catch the bug: a leak was temporarily
   reintroduced into one file during development of this test, confirmed the
   test failed, then reverted.
4. **`platform_admins` self-elevation safeguards remain present** in
   `0009_platform_admins.sql` (the `is_super_admin()` guard and the
   self-removal block in `admin_set_super_admin()`).

`apps/web/tests/input-validation.test.mjs` (added with APPSEC-09 Phase 1) — 17
offline unit + regression tests for the `lib/validation` Zod layer covering
quotations/jobs/complaints: malformed UUIDs, blank-after-trim required strings,
**Arabic content acceptance**, NaN/Infinity/negative number rejection, unknown
enum rejection, safe-message extraction (no raw Zod), per-domain valid/invalid
payloads, and security regressions (client `business_id` is dropped by the schema
and the complaints action derives `business_id` from the session; all three
actions call `safeParse` + `firstValidationMessage`). See
[INPUT_VALIDATION_STANDARD.md](INPUT_VALIDATION_STANDARD.md).

`apps/web/tests/portal-input-validation.test.mjs` (added with APPSEC-09
Phase 2) — offline unit + regression tests for the customer-portal action
schemas (`portalCreateComplaintSchema`, `portalComplaintReplySchema`, reused
`approveQuoteSchema`, `rejectQuoteSchema`): valid English **and Arabic**
payloads, blank/malformed/enum rejection, severity defaulting, plus static
security regressions asserting that all four portal actions call `safeParse`,
mutate only with session-derived identity (never raw client
`business_id`/`customer_id`), perform explicit ownership + `'sent'`-state
queries before quote/complaint mutations (APPSEC-11), use non-enumerating
"not found or unavailable" responses, and that the portal quote detail page
keeps its explicit ownership check.

**Manual/local QA (not automated):** runtime cross-customer denial — Customer A
attempting Customer B's `/portal/quotes/[id]`, quote approval/rejection, or
complaint reply must receive an indistinguishable not-found/unavailable result.
Run against the local Supabase stack only (see MULTI_TENANT_TEST_MATRIX.md).

`apps/web/tests/customer-input-validation.test.mjs`,
`vehicle-input-validation.test.mjs` and `business-settings-validation.test.mjs`
(added with APPSEC-09 Phase 3) — offline unit + regression tests for the
customer, vehicle and business-settings schemas: valid English **and Arabic**
payloads, blank/malformed rejection, optional-email and country-agnostic phone
handling (international notation preserved verbatim, never coerced to a number),
customer language allowlist with the `en` default, the pre-existing vehicle-year
range, VIN kept verbatim with **no decoding or specification enrichment**,
nullable service price, strict `manager`/`employee` invitation roles (rejecting
`super_admin`/`business_owner`/`customer`), logo MIME/zero-byte rejection, and
Storage-path ownership (`<business id>/branding/<file>` only — traversal,
absolute, backslash, extra-segment and cross-tenant paths rejected). Static
regressions assert every targeted action calls `safeParse`, mutates with
session-derived identity, scopes updates by `business_id`, and that **no
invitation-expiry implementation or migration was introduced (APPSEC-10 stays
open)**.

`apps/web/tests/evidence-storage-validation.test.mjs` (added with APPSEC-09
Phase 4A) — 23 offline tests for evidence/attachment Storage-path ownership:
valid complaint payloads, Arabic descriptions, malformed ids, positive-integer
sizes (zero-byte rejected, **no maximum invented**), shape-only MIME checks (no
invented allowlist), filename-as-display-metadata rules, and exhaustive path
rejection — cross-tenant namespaces, `<business-id>-evil` prefix collisions,
traversal, absolute/trailing/double-slash paths, empty/extra/missing segments,
backslashes, control characters and NUL, unsafe object names, and
non-interchangeable namespaces. Static regressions assert both actions call
`safeParse`, derive business scope server-side, persist only verified path
components, ownership-check document links, use non-enumerating errors, never
log raw provider messages, and that no Storage `.remove()` path was introduced.

`apps/web/tests/vehicle-media-security.test.mjs` (added with APPSEC-09
Phase 4B) — 24 offline tests for vehicle-media upload authorization: payload
validation (Arabic descriptions, malformed vehicle/customer UUIDs, the
database-backed `media_type` allowlist, positive-integer size with **no invented
maximum**, MIME shape, filename rules), client bucket/tenant fields proven
stripped, and exhaustive five-segment path checks — wrong business, prefix
collisions, **same-business wrong vehicle**, wrong namespace segments,
traversal, absolute, backslash, empty/extra segments, control characters, NUL
and unsafe object names. Plus a privileged-boundary guard
(`authorizeStoredVehicleMediaPath`) covering unapproved buckets and malformed
stored paths, and **release-gate tests** that fail if a known vehicle-media
reader performs a privileged Storage operation without the guard, renders
`storage_path` into `src`/`href`/background/`srcSet`, or if the stored-value
revalidation rule disappears from the standard. Limitation stated honestly: the
gate is an explicit call-site registry, so new privileged consumers must be
added to it deliberately.

**Local-only integration QA performed for Phase 4B (8/8 passed)** against the
local Supabase stack with two disposable businesses, customers and vehicles. It
proved: business A can record media on its own vehicle; A cannot record against
B's vehicle (the ownership lookup returns no row); a customer from B cannot be
paired with A's vehicle; a client-selected alternate bucket never reaches
persistence; cross-tenant and same-business wrong-vehicle paths are rejected;
and the privileged guard denies an unapproved bucket and a malformed stored
path without invoking any signer. Disposable rows were deleted afterwards; no
hosted Supabase, no real vehicle images, no AI provider calls.

**Local-only corrective QA performed for Phase 4A (8/8 passed)** — a second
local run covering the two gaps found in pre-merge review, using one business
with two portal customers plus a second business. It proved: a new owned
resource-bound path is accepted on write; cross-tenant and same-business
*other-customer* paths are rejected on write; a **pre-patch style malicious row**
(stored by invoking the SECURITY DEFINER RPC directly with a cross-tenant path,
which still succeeds because the RPC is unchanged) is **denied at sign time**
with code `path_unverified`; a same-business wrong-resource stored path is
likewise denied; the legitimate own-resource path is authorized; unbound legacy
paths are staff-viewable but fail closed for portal customers
(`legacy_unbound_customer`); and the RPC's own 42501 backstop still denies a
non-owner attach. No signed URL was printed and the signer was never invoked for
a denied path.

**Local-only integration QA performed for Phase 4A (7/7 passed)** against the
local Supabase stack with two disposable businesses. This QA is notable because
it **confirmed the finding empirically before proving the fix**: invoking the
`record_complaint_evidence` SECURITY DEFINER RPC directly with a cross-tenant
object path stored the row successfully (the RPC checks who may attach, not the
path), while the new caller-side validator rejects that same path and the
prefix-collision variant, accepts the business's own path, still permits a
legitimate own-business attach end-to-end, and confirms the RPC's authorization
backstop denies a cross-business attach (42501) with cross-business complaint
lookups returning no row. Disposable rows were deleted afterwards.

**Local-only integration QA performed for Phase 3 (6/6 passed)** against the
local Supabase stack with two disposable owner accounts in separate businesses.
These cases exercise the **RLS backstop directly at the table level** (they are
database probes, not calls through the server actions), which is what makes them
a meaningful independent check of the new application-layer scoping:

1. cross-business customer update denied;
2. cross-business customer **soft-delete probe** denied — a direct write to the
   `customers.deleted_at` column. Note there is **no customer archive/restore
   server action** on this surface today (see
   [INPUT_VALIDATION_STANDARD.md](INPUT_VALIDATION_STANDARD.md)); this case
   verifies the column cannot be written cross-tenant, and must not be read as
   an archive action having been added or hardened;
3. cross-business vehicle update denied;
4. cross-business business-profile update denied;
5. cross-business invitation revocation denied;
6. same-business customer and vehicle updates succeeded (no over-blocking).

Disposable rows were deleted afterwards; no hosted Supabase, production users, or
external email were involved.


`apps/web/tests/notification-security.test.mjs` (added with APPSEC-09
Phase 4C) — 33 offline tests for the notification service, the product's
largest service-role surface. Queue time: template/channel allowlists, bounded
dedupe keys, scalar-only template variables, and an allowlisted payload that
strips signed URLs, Storage paths, redirect URLs and API keys. Dispatch time:
the claimed row is treated as untrusted stored input — tests prove a **poisoned
`recipient_email`/`recipient_phone` is ignored and the destination is re-derived
from the verified customer**, and that missing/mismatched business, mismatched
customer, cross-business source resource, non-dispatchable channel (`push` and
the unimplemented social enum values), unknown template, malformed payload,
malformed row, clamped/exhausted attempts and a non-`processing` status all fail
closed with stable PII-free codes. Static regressions assert authorization
precedes every provider call, the live-send gate is consulted first, raw
provider text is never stored or logged, and a throwing row is released rather
than left locked.

**Local-only QA performed for Phase 4C (11 of 12 cases).** Two disposable
businesses with customers and quotes verified: valid queue validation;
cross-business source, mismatched customer, arbitrary channel and arbitrary
template all denied; poisoned stored recipient ignored with the destination
re-derived; customer/business mismatch not dispatched; malformed payload denied
without throwing; a poisoned row not blocking the next valid row; live delivery
disabled so no provider is contacted; and denial codes containing no PII.
**Documented limitation:** the local database predates migration `0030` —
`notification_events` has no `dedupe_key`/`attempt_count`/`locked_until` columns
and `claim_queued_notification_events` does not exist locally — so the
idempotency unique-index case and the claim/lock semantics could not be
exercised at runtime and are covered by schema review plus unit tests instead.
No provider was contacted, no email or SMS was sent, and no destination or
payload content was printed.

See [APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md) for the findings these
tests guard against.

## 3. Why Live-RLS Tests Are Not Added in This Pass

A true multi-tenant RLS test (spin up two business accounts, two customer
accounts, and assert cross-access is denied) requires a running Supabase instance
with migrations applied — `scripts/e2e.mjs` already does exactly this against
`127.0.0.1:54321`, and was confirmed working during this program's validation
passes. It is still not folded into `apps/web/tests/*.test.mjs` / `pnpm test`,
because that suite is expected to run offline in any environment (including CI,
once DEVSECOPS-03 is addressed) — making `pnpm test` depend on a live local
Supabase stack would make it fail in any environment without one, which violates
the "no brittle tests requiring real credentials" rule for this audit. **Manual QA
scripts are provided as the documented alternative** (see §4), and `scripts/e2e.mjs`
(invoked via `pnpm smoke:routes`) remains the authoritative automated cross-tenant
check for environments that do have the local stack running.

## 4. Manual QA Scripts (for anyone with a runnable environment — local Docker
stack or a disposable hosted Supabase project)

- [MULTI_TENANT_TEST_MATRIX.md](MULTI_TENANT_TEST_MATRIX.md) — Business A vs.
  Business B, Customer A vs. Customer B cross-access attempts.
- [ACCOUNT_SAFETY_TEST_MATRIX.md](ACCOUNT_SAFETY_TEST_MATRIX.md) — login, session
  expiry, password reset, invite reuse, role-boundary attempts.
- [NOTIFICATION_SAFETY_TEST_MATRIX.md](NOTIFICATION_SAFETY_TEST_MATRIX.md) —
  dispatcher no-op verification, opt-out, label/redaction checks.
- [AI_SAFETY_TEST_MATRIX.md](AI_SAFETY_TEST_MATRIX.md) — diagnostic guardrails,
  VIN grounding, tenant scoping.

## 5. Running the Suite

```
cd apps/web
pnpm test
```

All tests in this plan run offline, with no real credentials, no live provider
calls, and no database connection (except `scripts/e2e.mjs`, which is a separate
script, not part of `pnpm test`, and is only meaningful against a local Supabase
stack).

## 6. Rules Followed

Per program ground rules: no test added in this pass requires production secrets,
makes a real provider call, sends a notification, or mutates production data. All
new assertions are against source/migration text or pure in-memory functions.
