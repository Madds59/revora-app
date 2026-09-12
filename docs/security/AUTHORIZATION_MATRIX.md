# Authorization Matrix

Roles are defined by `public.member_role` (`business_owner`, `manager`, `employee`)
plus two roles that exist outside that enum: **Customer** (a `customers` row linked
via `app_user_id = auth.uid()`, not a `business_members` role) and **Platform Admin**
(a row in `platform_admins`, also not a `business_members` role). A single
`auth.users` identity can simultaneously be a business member of one business and a
customer of a different business — the app picks the right context per route group
(`requireMembership()` vs `requireCustomerPortal()`).

Legend: **None** = no access · **R** = read own/business-scoped data ·
**W** = create/update within scope · **M** = manage (includes role-restricted
actions like invites, settings, deletion) · enforcement column cites the actual
RLS helper or app guard.

| Resource | Platform Admin | Business Owner | Manager | Employee | Customer | Unauthenticated | Enforcement |
|---|---|---|---|---|---|---|---|
| `businesses` / `branches` | R (aggregate, via `admin_*` RPCs) | M | R/W (no delete) | R | None (except public-facing business profile fields shown in-app) | None | `is_business_member()`, `has_business_role()`, `is_super_admin()` |
| `business_members` / `business_invitations` | None direct | M (invite/revoke manager+employee) | R | R (own row) | None | None | `is_business_member()`, `has_business_role(['business_owner'])` |
| `profiles` | None direct (joined in admin RPCs for display) | R (own) | R (own) | R (own) | R (own) | None | `profiles_update_self`-style self-only policy |
| `customers` | R (aggregate) | M | M | R/W | R/W (own record only) | None | `is_business_member()` OR `app_user_id = auth.uid()` |
| `vehicles` / `projects` | None direct | M | M | R/W | R (own vehicle) | None | `is_business_member()` OR `is_customer_for_business()` |
| `quotations` / `quotation_items` / `quotation_revisions` | R (aggregate count only) | M | M (per `canManageQuotes(role)`) | R/W (per role check) | R (own) + W (approve/reject only) | None | `is_business_member()` OR `is_customer_for_business()`; app-level `canManageQuotes()` |
| `approvals` / `approval_events` | None direct | R | R | R | W (insert own approval only, signature flow) | None | `approvals_customer_insert` requires caller = linked customer |
| `jobs` / `job_tasks` / `job_updates` | None direct | M | M | R/W | R (own vehicle's jobs) | None | `is_business_member()` OR `is_customer_for_business()` |
| `complaints` / `complaint_messages` | R (aggregate count only) | M | M | R/W | R/W (own complaint; cannot see other staff-internal messages) | None | `is_business_member()` OR `is_customer_for_business()`; internal-message flag must stay query-excluded from customer paths |
| `complaint_evidence` / `media_assets` / `documents` | None direct | M | M | R/W | R/W (own evidence, via `record_complaint_evidence()`) | None | Storage RLS path-scoped by `business_id`; signed URLs |
| `inspection_templates` / `inspection_template_items` *(DVI, pending merge)* | None direct | M | M | R | None | None | `is_business_member()` for read; `has_business_role(['business_owner','manager'])` for write; app-level `canManageInspectionTemplates()` |
| `vehicle_inspections` *(DVI, pending merge)* | None direct | M | M | R/W (create, record results, complete — **not** share, **not** convert to quote) | R (own, **completed only**) | None at table level; a **share-link holder** reads one completed report through `resolve_inspection_share()` only | `has_business_role([owner,manager,employee])` for staff; customer read additionally requires `status = 'completed'` AND `is_customer_for_business()`; app-level `canManageInspections()` / `canShareInspections()` |
| `inspection_items` *(DVI, pending merge)* | None direct | M | M | R/W (draft only — immutable once completed, by trigger) | R (own, completed only) | None at table level; item rows for one report via `resolve_inspection_share_items()` only | `inspection_items_manage_staff` + `inspection_in_business()`; `enforce_completed_inspection_immutable()` blocks all writes post-completion regardless of role |
| `inspection_item_media` *(DVI, pending merge)* | None direct | M | M | R/W (draft only) | R (own completed report's photos) | None at table level; signed URL only, minted after the token validates | `inspection_item_in_business()` + `media_asset_in_business()`; storage path is resource-bound `<business_id>/inspection-item/<item_id>/<object>`, re-authorized by `signOwnedStorageObject()` before the service role signs |
| `create_inspection()` / `complete_inspection()` RPCs *(DVI, pending merge)* | None | Execute | Execute | Execute | None | None | `has_business_role([owner,manager,employee])` inside each `SECURITY DEFINER` function |
| `set_inspection_share()` / `revoke_inspection_share()` / `create_quotation_from_inspection()` RPCs *(DVI, pending merge)* | None | Execute | Execute | **None** | None | None | `has_business_role(['business_owner','manager'])` inside each function — an employee is refused at the RPC, not merely hidden in the UI |
| `resolve_inspection_share()` / `resolve_inspection_share_items()` RPCs *(DVI, pending merge)* | Execute | Execute | Execute | Execute | Execute | **Execute — the only `anon`-executable functions in the schema, by design** | No caller identity check by design; authorization *is* the SHA-256 token hash argument, plus `status = 'completed'`, not revoked and not expired, enforced inside the function |
| `subscriptions` / `billing_invoices` / `billing_payment_events` | R (aggregate) | M (view/manage via Stripe portal) | R | None | None | None | `is_business_member()` restricted further by role for mutation; Stripe webhook is system of record |
| `notification_events` / `notification_delivery_attempts` | None direct | R | R | None | None (raw log); customer sees only the rendered, redacted message itself | None | `is_business_member()`; service role for dispatch |
| `notification_preferences` | None direct | R (business settings) | R | None | R/W (own) | None | `is_business_member()` OR own row |
| Vehicle Intelligence tables (`vehicle_symptom_reports`, `vehicle_diagnostic_results`, `vehicle_dtc_codes`, `vehicle_maintenance_plans`) | None direct | M | M (per `canManageCustomers(role)` for search) | R/W | R (own vehicle) | None | `is_business_member()` OR customer-linked equivalent |
| `ai_tool_calls` / `ai_safety_flags` | None direct | R (staff-only, not customer-facing) | R | R | None | None | `is_business_member()` only — no customer path |
| `audit_events` | R (cross-tenant, platform oversight) | R (own business's events — verify scope) | None confirmed | None confirmed | None | None | Business-nullable FK; access policy should be re-confirmed as part of a future audit-log-specific review |
| `platform_admins` | R (self row only) | None | None | None | None | None | `platform_admins_select_self`; mutation only via `admin_set_super_admin()` RPC |
| `admin_platform_metrics()` / `admin_list_businesses()` / `admin_list_super_admins()` RPCs | Execute | None | None | None | None | None | `is_super_admin()` check inside each `SECURITY DEFINER` function |

## Notes

- **"None confirmed" on `audit_events`** for Business Owner/Manager means this
  review did not find an explicit policy granting business-scoped read of audit
  events — if owners are expected to see their own business's audit trail in a
  future feature, that policy needs to be added deliberately (and reviewed,
  since `old_data`/`new_data` can contain another user's personal data within the
  same business, e.g. a different customer's record being edited by staff).
- **Customer role is per-business-relationship**, not global — a person who is a
  customer of Business A and Business B has two separate `customers` rows, and
  Revora must never merge them into a single cross-business view.
- **Role hierarchy within a business** (owner > manager > employee) is enforced by
  `has_business_role()` taking an explicit allowed-roles array per policy/action,
  not by a numeric hierarchy — when adding a new manager-or-above action, the
  array must be set explicitly; there is no implicit "owner can do everything
  manager can" shortcut to rely on without checking the actual array.
- **DVI rows are marked *(pending merge)*** — migration `0037` and its application
  layer are on `feature/dvi-v1` (PR #16), not on `main`. Drop the marker when it
  merges; if the PR is abandoned, remove the rows rather than leaving them to rot.
- **The `Unauthenticated` column stopped being uniformly "None" with DVI.** The two
  share resolvers are the first and only functions granted to `anon`. Read that
  column as the definitive list of what an anonymous caller can reach: if a future
  change adds a second non-`None` cell here, it is a trust-boundary change and needs
  the public-route section of
  [SECURITY_RELEASE_GATE.md](SECURITY_RELEASE_GATE.md) run against it.
- **Supabase `DEFAULT PRIVILEGES` grant `EXECUTE` on every new `public` function to
  the `anon` role directly.** `revoke ... from public` does **not** undo that. Any
  new function must `revoke ... from public, anon` explicitly, or it silently
  acquires a non-`None` cell in the Unauthenticated column. Tracked as APPSEC-19.
- This matrix reflects *intended* authorization. Cross-check against
  [APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md) for what was actually verified
  in code, and re-derive this matrix from `supabase/migrations/0002_rls_policies.sql`
  (plus later migrations) whenever policies change.
