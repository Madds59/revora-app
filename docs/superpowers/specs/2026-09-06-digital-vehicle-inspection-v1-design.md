# Digital Vehicle Inspection (DVI) V1 — Design

Date: 2026-09-06
Branch: `feature/dvi-v1`
Base: `41dc5a2` (`origin/main`, immediately after PR #15 merged)
Status: approved architecture, authoritative for this engagement

---

## 1. Problem

Revora can quote, schedule, work and bill a vehicle, but it cannot **show the customer why the work is
needed**. GaragePlug's principal differentiator is a Digital Vehicle Inspection: a photo-backed checklist
that turns "trust us, the brakes are worn" into evidence the customer can look at before approving spend.

Revora already sells transparency — part origin, warranty, expected lifespan, signed approvals, complaint
evidence. DVI is the missing first link in that chain. The end-to-end story it completes is:

> we inspected it → here is the evidence → here is what we recommend → here is what it costs → approve what you want

## 2. Goals

- One inspection model serving two contexts: **pre-quote** (justify the quote) and **in-job** (additional
  work found mid-repair).
- Per-item result with optional customer-safe note and optional photos.
- Historical truth: a completed report never changes, even if its template is later edited.
- Findings convert into a **draft** quotation with provenance, and with **no fabricated prices**.
- Customer sees the report in the authenticated portal.
- Optional public share link so the customer can forward the evidence.
- Full tenant isolation, enforced in the database, not only in application code.

## 3. Non-goals (V1)

- Staff-email digests of inspections.
- Automatic or AI-derived pricing of findings.
- OEM / regulatory inspection standards. The seeded checklist is an **operational workshop template**, not
  a manufacturer or government standard, and must never be presented as one.
- OBD/telematics ingest.
- Multi-language template content per item (see §12).
- Re-opening a completed inspection (see §6).
- Root-causing the production `/notifications` defect (tracked separately; see §17).

## 4. User journeys

**J1 — Pre-quote (arrival).** Vehicle arrives, with or without an appointment. Staff start an inspection
from the vehicle, choose a template, work the checklist on a phone, attach photos to anything notable, and
complete it. They select the `attention`/`fail` findings worth quoting; Revora creates a **draft** quotation
with one line per finding, description prefilled, price blank. Staff price it and send it. The existing
quote → approval → job pipeline is unchanged.

**J2 — In-job (discovered work).** A job is underway. Staff start an inspection from the job, record what
they found, complete it, and convert selected findings into a **separate draft quotation** for the additional
work. That quote goes through the same approval flow; on approval the existing trigger creates its own job,
which is the correct representation of additional work.

**J3 — Customer.** The customer opens the completed report in the portal, sees each item's result, the note,
and the photos. Optionally they receive a share link they can forward to a spouse or a second opinion.

## 5. Entities

| Table | Role |
|---|---|
| `inspection_templates` | Per-business reusable checklist. `is_default` marks the seeded one. |
| `inspection_template_items` | Section, label, position, `is_active`. Editable by owner/manager. |
| `vehicle_inspections` | Header: business, customer, vehicle, performer, `context`, nullable `appointment_id` and `job_id`, `status`, source `template_id`, completion metadata, nullable `quotation_id`, share metadata. |
| `inspection_items` | **Snapshot** rows: `section`, `label`, `position` copied at creation, plus `result` and `note`. |
| `inspection_item_media` | Junction to existing `media_assets`, mirroring `complaint_evidence`. |

### Snapshot rule

`inspection_items.section` and `.label` are copied from the template **at inspection creation** and are never
recomputed. Editing, reordering, deactivating or deleting a template afterwards has no effect on inspections
already created. This is the same principle as freezing `business_trn` onto an issued invoice: a document
shown to a customer must not silently change afterwards.

### Result vocabulary

`pass` · `attention` · `fail` · `not_checked`

`not_checked` is a distinct outcome and is **never** treated as `pass`. New items default to `not_checked`.

## 6. State machine

```
draft ──complete──> completed
```

**Draft.** Staff may set results, edit notes, attach/remove photos.

**Completed.** The customer-facing historical artifact. Only a completed inspection may be shown in the
portal, publicly shared, or converted to a quotation. Completion stamps `completed_at` and `completed_by`.

**Immutability.** Once `completed`, item results/notes/labels and the inspection's identity columns are
immutable, enforced by trigger. Only share-lifecycle columns (`share_*`) and `quotation_id` may still change,
because those are subsequent facts about the document, not edits to it.

Revora has no reusable audited reopen mechanism today (`audit_events` records events but there is no revision
model for domain rows). Rather than add an unaudited "edit completed report" escape hatch, V1 makes completed
content immutable. A correction is a new inspection — the same stance invoicing takes with credit notes.

## 7. Database relationships and integrity

RLS governs *who* may touch a row. It does not prevent an authorized user of Business A from stitching
together *their own* rows incoherently, or from referencing another tenant's row they happen to know the id
of. A `BEFORE INSERT OR UPDATE` trigger (`enforce_inspection_integrity`) therefore validates:

- `customer_id` belongs to `business_id`.
- `vehicle_id` belongs to `business_id` **and** to `customer_id`.
- `template_id`, when present, belongs to `business_id`.
- `appointment_id`, when present, belongs to the same business, customer and vehicle.
- `job_id`, when present, belongs to the same business and customer.
- `context = 'in_job'` **requires** `job_id`; `context = 'pre_quote'` **forbids** it.
- `pre_quote` does not require an appointment — walk-ins are legitimate. No placeholder job is ever created
  to satisfy a foreign key.

`inspection_items` and `inspection_item_media` similarly verify that their parent and their `media_asset`
belong to the same business as the inspection.

## 8. Authorization model

| Actor | Capability |
|---|---|
| `business_owner`, `manager` | Full: templates, inspections, completion, share links, quote conversion |
| `employee` | Create and edit **draft** inspections, attach media, complete. No template administration, no share-link management |
| Customer | Read own **completed** inspections only |
| Anonymous | Nothing at table level. Public sharing crosses the boundary only through a narrowly scoped `SECURITY DEFINER` function |

Template administration is owner/manager only, matching `canManageSettings`. Inspection work is owner/manager/
employee, matching `canManageJobs`.

## 9. Tenant isolation

Every table carries `business_id`, has RLS enabled, and follows the `0035` hardening convention: policy
`with check` clauses verify not only role but that each referenced foreign key resolves **inside the same
business**, using the existing `customer_in_business` / `vehicle_in_business` / `job_in_business` /
`vehicle_in_customer` helpers plus new `inspection_in_business` and `template_in_business` helpers.

All helpers are `SECURITY DEFINER` with `set search_path = public`, `revoke all ... from public`, and
`grant execute ... to authenticated` only.

## 10. Media model

Reuses `media_assets` unchanged. `media_assets.purpose` is unconstrained `text` in the current schema, so
DVI uses `purpose = 'inspection_item'` with no enum migration.

Uploads go through the existing browser-direct-to-Storage → server-action-records-row pattern
(`components/file-upload.tsx` + a DVI action), writing into the existing private bucket. Reads are
short-lived signed URLs minted server-side after data-layer authorization succeeds — never stored, never
returned to a caller that has not already passed the authorization check for that specific inspection.

## 11. Quotation integration

**Selection.** Only `attention` and `fail` items are eligible. Staff explicitly choose which to quote.

**Creation.** A `SECURITY DEFINER` RPC creates a quotation draft via the same gapless `Q-####` numbering as
`create_quotation_draft`, then inserts one `quotation_items` row per selected finding:
`name` = the finding's label, `description` = the finding's note, `kind = 'service'`,
**`unit_price = 0`** — deliberately blank for staff to price. Revora never invents a price from a checkbox.

**Provenance.** `quotation_items.source_inspection_item_id` — a nullable FK, the smallest normalized design
that answers "which finding produced this line" without contaminating quotation behaviour. Existing rows and
existing quote flows are unaffected (the column is nullable and unset everywhere else).

**Idempotency.** Two layers:
1. `vehicle_inspections.quotation_id` — once set, the RPC returns the existing quotation instead of creating
   a second one.
2. `unique (quotation_id, source_inspection_item_id)` (partial, where source is not null) — a finding can
   appear at most once on a given quotation.
Plus a per-business advisory lock around creation, matching the invoicing numbering pattern.

**In-job semantics.** Additional work becomes its own quotation, not a mutation of the original. On approval
the existing `handle_quote_approved` trigger creates its own job. This preserves the existing invariant that
every job traces to an approved quote, and does not force the pre-quote path into an incompatible shape.

## 12. Localization

Revora's business-authored content (`services.name`, `products.name`, quote line names) is **single-string
text**, rendered as authored. Inspection template labels follow that existing model — a fourth strategy is
not invented here.

The seeded default template is created in the business's `default_language`, using EN or AR label sets held
in application code alongside the existing notification templates.

**Accepted limitation:** a bilingual workshop's template renders in one language. This matches every other
business-authored entity in Revora today and is recorded as debt rather than silently ignored.

All *chrome* — buttons, headings, statuses, validation, share management, portal and public report labels —
is fully EN/AR via the existing `next-intl` message catalogues, RTL included.

## 13. Public share — threat model

The first unauthenticated surface in the application. Treated as a security boundary.

| Control | Decision |
|---|---|
| Secret | 32 cryptographically random bytes, base64url (43 chars). Never a UUID. |
| Storage | **SHA-256 hash only.** Plaintext is returned once at generation and never persisted. A database leak yields no working links. |
| Lookup | By hash. Constant shape; no prefix/partial matching. |
| Expiry | Default 30 days, stored as `share_expires_at`. |
| Revocation | `share_revoked_at`. |
| Rotation | Generating a new token overwrites the hash, which invalidates the previous one. One active link per inspection. |
| Draft | A draft can never be shared; enforced in the RPC and by the completed-only read path. |
| Error behaviour | Unknown, expired, revoked and malformed tokens are **indistinguishable** — one generic "not available" response. No existence oracle. |
| Headers | `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, plus `<meta name="robots">`. |
| Middleware | Exempted by an **exact** regex `^/i/[A-Za-z0-9_-]{43}$` inside `isPublicPath`, not a directory exemption. |
| Telemetry | The token sits in the URL path, so the route disables analytics/telemetry collection and must never appear in logs or error reports. |
| Media | Token validated **first**; only then are short-lived signed URLs minted, scoped to that inspection's assets. |

**Public payload — allowed:** workshop name, vehicle make/model/plate label, inspection date, summary,
sections/items with results and customer-safe notes, photos.
**Public payload — forbidden:** customer name, email, phone, address, customer id, other vehicles, other
inspections, any pricing, quotation or invoice data, internal notes, staff identity, raw storage paths, and
any tenant identifier usable for enumeration.

**Abuse resistance.** The merged codebase has **no** reusable rate-limit primitive — `auth_rate_limits` lives
only on the unmerged APPSEC-10 branch (`0031`–`0033`), and DVI must not depend on it. The residual threat is
brute-force enumeration of a 256-bit token, which is not a practical attack. V1 therefore ships **no bespoke
rate limiter**, deliberately, rather than duplicating an architecture that is about to land. This is recorded
as an explicit accepted decision, not an oversight, and the follow-up is to route the public share route
through the APPSEC-10 limiter once it merges.

## 14. Portal behaviour

`/portal/inspections` and `/portal/inspections/[id]`, listing only **completed** inspections belonging to the
signed-in customer's own linked accounts, scoped server-side via `requireCustomerPortal()` and RLS. Internal
notes, other customers, other vehicles, pricing and storage paths are never selected, not merely hidden.

## 15. Accessibility

Result controls are a labelled radio group per item — keyboard operable, screen-reader labelled, with a text
label plus an icon so status is **never conveyed by colour alone**. Touch targets ≥44px. The editor is built
mobile-first as a stacked card list, not a desktop table, because it is used on a phone in a workshop bay.

## 16. Observability and privacy

Log inspection creation failure, media association failure, share generation/revocation failure and quote
conversion failure — with ids only. Never log share tokens, signed URLs, note content, or customer PII.

## 17. Migration plan

**Number: `0037`.** Verified collision-free against every remote branch (highest claimed anywhere is `0036`;
APPSEC-10 holds `0031`–`0033`). Production currently runs `0030 → 0034 → 0035 → 0036`; `0031`–`0033` remain a
legitimate gap below head and will need `--include-all` when APPSEC-10 merges.

`0037` is **purely additive**: five new tables, one nullable column on `quotation_items`, new helper
functions, triggers and policies. No destructive DDL, no table rewrite, no backfill of existing rows.
Default-template seeding is idempotent and runs for existing businesses at migration time and for new
businesses via the existing onboarding path.

**Correction carried by this spec:** the earlier claim that production `/notifications` was broken because
`0030` had not been applied is **false**. `0030` was verified physically present in production (all tables and
all `notification_events` columns). `/notifications` remains a separately scoped, unresolved defect with an
unknown cause; this engagement does not investigate it.

## 18. Test strategy

Database-backed behavioural tests against the local Supabase Postgres, run as `authenticated` with
`request.jwt.claim.sub` set — the approach already used for invoicing and appointments in this repo.

Covering: RLS positive/negative cross-tenant read and write; customer isolation; integrity trigger rejection
for each mismatched anchor; `in_job` requires a job; `pre_quote` forbids one; template edit does not alter an
existing inspection; completed inspections reject mutation; share token stores only a hash; draft cannot be
shared; expiry, revocation and rotation each invalidate access; quote conversion prices nothing and records
provenance; repeat conversion is idempotent; anonymous cannot execute privileged helpers.

Plus repository gates: typecheck, lint, build.

## 19. Release criteria

Migration applies cleanly; all new tables have RLS with policies; every negative security test passes; the
Supabase Security Advisor reports no new ERROR-level finding attributable to this work; typecheck, lint and
build pass; CI green; EN and AR complete for all DVI chrome. Production application of `0037` follows merge.
