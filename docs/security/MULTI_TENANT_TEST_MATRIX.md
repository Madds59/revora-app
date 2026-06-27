# Multi-Tenant Test Matrix (Manual QA)

Requires a runnable environment with the schema/RLS applied (local Docker Supabase
stack, or a disposable hosted Supabase project — see project README). Not run as
part of this audit pass (no Docker on this machine); provided so a human (or a
future CI job once Docker/hosted test project is available) can execute it.

## Setup

Create, in the test environment only (never against production):

- **Business A** (owner + one manager + one employee)
- **Business B** (owner)
- **Customer A1** — a customer of Business A, with one vehicle and one quotation
- **Customer A2** — a second customer of Business A
- **Customer B1** — a customer of Business B

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

## Pass/Fail Recording

Record results in [SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md) (QA-01) —
any failure here is at minimum P1 (cross-tenant exposure) and should halt release
per [SECURITY_RELEASE_GATE.md](SECURITY_RELEASE_GATE.md).

## Automation Path Forward

Once a CI-reachable Supabase test instance exists (tracked as DEVSECOPS-03 in the
risk register), these cases should be converted into `scripts/e2e.mjs`-style
automated checks (that script already proves the pattern works against a local
stack) and run on every PR touching RLS/auth.
