# Multi-Tenant Test Matrix (Manual QA)

Requires a runnable environment with the schema/RLS applied (local Docker Supabase
stack, or a disposable hosted Supabase project — see project README). Not run as
part of this audit pass (no Docker on this machine); provided so a human (or a
future CI job once Docker/hosted test project is available) can execute it.

**Partial automation now exists for DVI** *(pending merge)*.
`supabase/tests/dvi_security_tests.sql` is an executable psql harness covering the
inspection surface — cross-tenant read/write, the portal read model, the role split,
photo visibility, and the anonymous share boundary. It was executed against a live
local Postgres on branch `feature/dvi-v1`. Cases 15–26 below cite its assertion
names, so they are **verified**, not merely specified, for that branch. The rest of
this matrix remains manual. This is the pattern QA-01 and DEVSECOPS-03 call for;
extending it to the pre-DVI tables is the remaining work.

## Setup

Create, in the test environment only (never against production):

- **Business A** (owner + one manager + one employee)
- **Business B** (owner)
- **Customer A1** — a customer of Business A, with one vehicle and one quotation
- **Customer A2** — a second customer of Business A
- **Customer B1** — a customer of Business B
- *(DVI)* Business A also needs an **employee** distinct from its manager, and
  Customers A1/B1 need `app_user_id` linked to real `auth.users` rows, so the portal
  and role-split cases can be exercised. The harness creates these itself.

## Test Cases

| # | Actor | Action | Expected result | Verifies |
|---|---|---|---|---|
| 1 | Business A owner | Load `/customers` | Sees only Business A's customers (A1, A2), never B1 | `is_business_member()` scoping on `customers` |
| 2 | Business A employee | Directly navigate to `/customers/<Business B customer id>` | Not found / no data (RLS denies the row) | Cross-tenant RLS on `customers` |
| 3 | Business A owner | Directly navigate to `/quotations/<Business B's quotation id>` | Not found / no data | Cross-tenant RLS on `quotations` |
| 4 | Customer A1 | Log into portal, view `/portal/quotes` | Sees only their own quotes, scoped to businesses they're a customer of | `is_customer_for_business()` |
| 5 | Customer A1 | Directly navigate to `/portal/quotes/<Customer A2's quote id>` | Not found / access denied (see APPSEC-11 — this page relies on RLS only, no redundant app check; confirm it still denies correctly) | RLS on `quotations`/`approvals` |
| 6 | Customer A1 | Directly navigate to `/portal/complaints/<Customer A2's complaint id>` | Not found (explicit app-level ownership check exists on this page in addition to RLS) | `portal/complaints/[id]/page.tsx` ownership check + RLS |
| 7 | Customer A1 | Submit `approveQuote` form action with a tampered `business_id`/`customer_id` pointing at Business B / Customer B1 | Rejected with "You do not have access to this quotation." | `portal/actions.ts` explicit account-ownership check |
| 8 | Business A employee | Attempt a manager-only action (e.g. revoke a teammate invitation) | Rejected — only `business_owner` role can manage invitations | `has_business_role(['business_owner'])` on `business_invitations` |
| 9 | Business A manager | Attempt to read Business B's `business_invitations` | No rows returned | `is_business_member()` on `business_invitations` |
| 10 | Business A owner | Upload a document, then try to access Business B's equivalent storage path directly via a guessed/incremented URL | Signed URL required; guessing a path without a valid signature fails | Storage RLS + signed URL expiry |
| 11 | Customer A1 | Attempt to read Business A's internal complaint notes (if such a field/endpoint exists) on their own complaint | Internal-only content not present in the customer-facing response | Internal-note query exclusion (see [DATA_CLASSIFICATION_MATRIX.md](DATA_CLASSIFICATION_MATRIX.md)) |
| 12 | Platform admin | Load `/admin` and run `admin_list_businesses()` | Sees aggregate data for both Business A and B (expected — this is the platform admin's intended scope) | `is_super_admin()` |
| 13 | Business A owner (not a platform admin) | Directly navigate to `/admin` | Redirected to `/` | `requireSuperAdmin()` |
| 14 | Any authenticated non-admin | Call `admin_set_super_admin()` RPC directly (e.g. via browser console / direct PostgREST call) | Rejected with `forbidden` (`42501`) | `is_super_admin()` guard inside the RPC |
| 15 | Business A employee *(DVI)* | Create, record results on, and complete an inspection | Allowed — 20 items snapshotted, status `completed` | `has_business_role([owner,manager,employee])` in `create_inspection()` / `complete_inspection()` — automated: `EMPLOYEE_CREATED_ITEMS`, `EMPLOYEE_COMPLETED` |
| 16 | Business A employee *(DVI)* | Call `set_inspection_share()` / `revoke_inspection_share()` / `create_quotation_from_inspection()` | Rejected — `not authorized` (owner/manager only), at the RPC and not merely hidden in the UI | Role split is enforced server-side — automated (3 rejection cases) |
| 17 | Customer A1 *(DVI)* | Load `/portal/inspections` | Sees only **completed** inspections for their own customer rows; drafts absent | `vehicle_inspections_read` completed-only clause — automated: `PORTAL_VISIBLE_TOTAL`, `PORTAL_DRAFT_ROWS=0` |
| 18 | Customer A1 *(DVI)* | Directly navigate to a **draft** inspection's id | Not found | Draft invisibility — automated: `PORTAL_DRAFT_ROWS=0` |
| 19 | Customer B1 *(DVI)* | Query Business A's inspections | 0 rows | Cross-tenant RLS — automated: `PORTAL_CROSS_TENANT_ROWS=0` |
| 20 | Customer A1 *(DVI)* | Attempt to edit a note on their own completed report | 0 rows written **and** the original value survives — note that RLS makes this a silent 0-row UPDATE, not an error, so an "expect an exception" assertion would pass even if the write landed | `inspection_items_manage_staff` + immutability trigger — automated: `PORTAL_TAMPER_ROWS_WRITTEN=0`, `PORTAL_TAMPER_LEAKED=0` |
| 21 | Customer A1 *(DVI)* | Call `complete_inspection()` / `set_inspection_share()` directly | Rejected — `not authorized` | Customers hold no staff capability — automated (2 rejection cases) |
| 22 | Customer B1 *(DVI)* | Read `inspection_item_media` rows belonging to Business A | 0 rows, while Customer A1 sees 1 for their own completed report | Photo visibility — automated: `MEDIA_OWNING_CUSTOMER_ROWS=1`, `MEDIA_CROSS_TENANT_ROWS=0`, `MEDIA_ANON_ROWS=0` |
| 23 | Anonymous *(DVI)* | Resolve a live share token via `resolve_inspection_share()` | 1 header row + item rows — this is the feature working as intended | The one deliberate anonymous path — automated: `ANON_RESOLVE_HEADER_ROWS=1` |
| 24 | Anonymous *(DVI)* | Fetch `/[locale]/i/<token>` with an unknown, an expired and a revoked token | All three render the same generic "not available" page, byte-identical | No existence oracle — verified manually against the running production build (78,829 B each) |
| 25 | Anonymous *(DVI)* | `SELECT` directly from any DVI table; call any DVI RPC other than the two resolvers | 0 rows; `permission denied` on every privileged function | Table grants + explicit `revoke ... from public, anon` — automated: `ANON_ITEM_SELECT_ROWS=0`, `ANON_TEMPLATE_SELECT_ROWS=0`, 2 rejection cases |
| 26 | *(DVI, schema assertion)* | Enumerate every `%inspection%` function with `anon=X` in its ACL | Exactly `resolve_inspection_share, resolve_inspection_share_items` — no more | Catches the Supabase `DEFAULT PRIVILEGES` gap on any newly added function — automated: `ANON_FUNCTION_ALLOWLIST_EXACT=true` |

## Pass/Fail Recording

Record results in [SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md) (QA-01) —
any failure here is at minimum P1 (cross-tenant exposure) and should halt release
per [SECURITY_RELEASE_GATE.md](SECURITY_RELEASE_GATE.md).

## Automation Path Forward

Once a CI-reachable Supabase test instance exists (tracked as DEVSECOPS-03 in the
risk register), these cases should be converted into `scripts/e2e.mjs`-style
automated checks (that script already proves the pattern works against a local
stack) and run on every PR touching RLS/auth.

`supabase/tests/dvi_security_tests.sql` *(pending merge)* is the closest thing to
that today and is the template worth copying: a psql script that runs as
`authenticated` with `request.jwt.claim.sub` set per actor, asserting named
`KEY=value` markers that a CI step can grep. Its limitation is that **nothing runs it
automatically** — CI has no Postgres service, so it is executed by hand. Wiring a
Postgres service container into `.github/workflows/ci.yml` would convert cases 15–26
from "verified once, on a branch" into "enforced on every PR", and is the single
highest-value next step for QA-01.
