# Data Retention and Deletion Plan

Owner: Privacy Owner. Status: **draft policy proposal**, not yet legally confirmed —
see disclaimer in §6.

## 1. Current Technical Reality

- Several core tables (`businesses`, `customers`, and others observed via the
  `admin_platform_metrics()`/`admin_list_businesses()` queries in
  `supabase/migrations/0009_platform_admins.sql`) use a **soft-delete** pattern via
  a `deleted_at` timestamp column rather than hard deletion.
- Child tables (e.g. `vehicles`, `projects`) cascade on hard delete of their parent
  customer (`on delete cascade`), but since customers are soft-deleted in practice,
  cascade-on-hard-delete is not the normal deletion path today.
- There is **no automated purge/retention job** currently in the codebase. Data is
  retained indefinitely until someone manually intervenes.
- There is **no self-service "delete my account" or "export my data" flow** found
  in the reviewed routes/actions. This is a gap relative to typical data-subject-
  rights expectations (right to erasure / right to portability).

## 2. Proposed Retention Defaults (subject to legal confirmation)

| Data class | Proposed retention | Rationale |
|---|---|---|
| Business/branch data | Lifetime of subscription + 90 days grace, then soft-delete | Allow account recovery window |
| Staff profile/membership | Lifetime of membership; remove from `business_members` on offboarding, `profiles` may persist while `auth.users` exists | Staff may belong to multiple tenants over time (not currently modeled, but `profiles` is platform-wide) |
| Customer personal data + vehicles | Lifetime of business relationship + minimum legal/accounting retention (likely several years for a service business in the UAE — confirm with counsel) | Balances customer erasure rights against the business's legal need to retain service records |
| Quotation / job / contract data (incl. `approvals` signatures) | Long-term — treat as a legal/financial record, not routine data; do not auto-purge | Signed approvals have evidentiary value in a dispute |
| Complaint data | Per dispute-resolution cycle + legal retention afterward | May be needed for consumer-protection follow-up |
| Uploaded documents/evidence | Tied to the retention of the record they're attached to (quotation/job/complaint) | Orphaned documents should not outlive their parent record's retention |
| Notification logs (`notification_events`, `notification_delivery_attempts`) | Short-to-medium operational window (proposal: 12 months), then anonymize/delete `payload` | These are operational logs, not the customer's primary record |
| Billing/subscription records | Per UAE financial record-keeping requirements (commonly 5 years — confirm with counsel) | Legal/tax obligation likely overrides erasure requests |
| AI diagnostic inputs/outputs | Tied to the vehicle/job they relate to | Same logic as quotation/job data |
| Audit logs (`audit_events`) | Long-term, security/legal value; should survive most deletion requests | Erasing audit history undermines its purpose; legal must weigh in on how to reconcile with erasure rights |

These are **proposed defaults for discussion**, not implemented retention jobs.
No code in this pass implements automated deletion — that would be a schema/behavior
change requiring its own reviewed migration and is explicitly out of scope for this
audit pass.

## 3. Deletion Request Handling (current state: manual, ad hoc)

Today, if a customer or business asks to delete their data:

1. There is no in-app self-service flow — it must be handled manually by an
   operator with database access.
2. Soft-delete (`deleted_at`) is available for `businesses`/`customers` and should
   be preferred over hard delete so that linked legal records (approvals, billing)
   are not silently orphaned.
3. Hard deletion of a customer cascades to `vehicles`/`projects` — this is
   irreversible and should only be used when explicitly required (e.g. a verified
   erasure request with no overriding legal retention need) and only by someone
   with direct database access, with the action itself logged.

**This program does not implement an automated deletion pipeline.** Building one is
a recommended next step (see [SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md)
for tracking) but requires product, legal, and engineering design — it is not a
"small safe fix" under this audit's rules.

## 4. Export Request Handling (current state: manual, ad hoc)

No self-service export endpoint exists. An export request today would require an
operator to manually query the relevant tables scoped to the requesting
business/customer and produce a file. This should be formalized once legal
confirms what "complete export" must include under applicable law.

## 5. Backup Retention

See [BACKUP_AND_RECOVERY_PLAN.md](BACKUP_AND_RECOVERY_PLAN.md) — backups are a
separate retention surface (deleted data may persist in backups for the backup
retention window) and must be accounted for in any "we deleted your data" response
to a customer.

## 6. Required Legal Review

Retention periods above are engineering proposals based on common practice, **not**
confirmed legal minimums/maximums for the UAE/GCC. Final retention periods,
deletion obligations, and export format requirements must be confirmed by qualified
counsel before being published in a privacy policy or relied upon operationally.
See [LEGAL_PRIVACY_REVIEW_CHECKLIST.md](LEGAL_PRIVACY_REVIEW_CHECKLIST.md).
