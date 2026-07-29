# Input Validation Standard

Owner: AppSec Reviewer. Implements APPSEC-09 (see
[SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md) /
[APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md)). This standard defines how
externally supplied input to server mutations is validated. **Phase 1 covers
quotations, jobs, and complaints**; later phases extend it to the remaining
mutation boundaries.

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

## Remaining boundaries (NOT covered by Phase 1)

These external-input mutation boundaries in the same/adjacent domains still use
ad-hoc validation and are the scope of **Phase 2+**:

- `app/[locale]/(portal)/portal/actions.ts` — customer-facing `createComplaint`,
  `addComplaintReply`, `approveQuote`, `rejectQuote` (higher-risk, customer
  input; recommend prioritizing in Phase 2).
- `(dashboard)/customers/actions.ts`, `vehicles/actions.ts`,
  `settings/business/*` (business/branch/service/invite), `notifications/
  actions.ts`, `(admin)/admin/actions.ts`, `(onboarding)/onboarding/actions.ts`.
- Note: `lib/actions/retainer-scenarios.ts` and `lib/actions/membership-bundles.ts`
  already validate via Zod (`retainerScenarioSaveSchema`, `bundleDraftSchema`).

Because these remain, **APPSEC-09 is "Partially fixed — Phase 1 complete", not
fully closed.**

## Rollout plan

1. **Phase 1 (this change):** quotations, jobs, complaints (dashboard).
2. **Phase 2:** portal customer actions (complaint create/reply, quote
   approve/reject) + customers/vehicles.
3. **Phase 3:** settings/business, notifications, admin, onboarding.
4. Fold a "new server actions validate input via a `lib/validation` schema"
   item into [SECURITY_RELEASE_GATE.md](SECURITY_RELEASE_GATE.md) once coverage
   is broad.
