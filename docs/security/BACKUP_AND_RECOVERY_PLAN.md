# Backup and Recovery Plan

Owner: DevSecOps Owner. This document was prepared from code/config review only —
it does **not** confirm the actual backup configuration of Supabase project
`yqscayjvvnpsvocqrrot`, which lives in the Supabase dashboard, not the codebase.

## 1. What We Know From the Codebase

- All application data lives in Supabase Postgres (53 tables across
  `supabase/migrations/0001`–`0030`) plus Supabase Storage (two buckets:
  `revora-private`, `revora-public`).
- Migrations are the source of truth for schema and are tracked in git
  (`supabase/migrations/*.sql`) — schema itself is therefore always recoverable
  from version control, independent of any database backup.
- `audit_events` provides an application-level change log (actor, old/new data per
  row) that can assist reconstruction of *what changed*, though it is not a
  substitute for a real point-in-time database backup (it only captures changes
  the application code explicitly logs, not necessarily every mutation path,
  e.g. direct SQL run by an operator).

## 2. What Must Be Confirmed Operationally (outside this repo)

- [ ] **Supabase backup tier**: confirm whether the project's plan includes daily
      backups, point-in-time recovery (PITR), or only on-demand backups. This is a
      Supabase project setting, not something this codebase controls.
- [ ] **Backup retention window**: how many days/weeks of history are retained.
      This directly affects the realistic answer to "can we recover from an
      incident from N days ago."
- [ ] **Storage bucket backup**: confirm whether Supabase Storage objects
      (uploaded documents/evidence) are covered by the same backup policy as the
      database, or need a separate strategy (e.g. periodic export).
- [ ] **Restore test**: has a restore ever actually been tested (not just
      assumed to work)? Recommend a periodic (e.g. quarterly) restore drill to a
      throwaway project once the team has bandwidth.
- [ ] **Stripe as a secondary source of truth for billing**: since billing state
      is webhook-driven from Stripe, Stripe itself retains the canonical
      transaction history — in a worst-case Supabase data loss, billing state
      could theoretically be reconstructed from Stripe, but this is not an
      automated path today.

## 3. Recovery Priorities (in order, if a full restore were needed)

1. **Auth** (`auth.users`) — without this, no one can log in at all.
2. **Core tenancy** (`businesses`, `business_members`, `platform_admins`,
   `profiles`) — needed to restore who-can-access-what.
3. **Customer/vehicle data** — needed for the core product to function.
4. **Quotations/jobs/complaints/approvals** — operational + legal record value.
5. **Billing tables** — cross-check against Stripe after restore to catch any
   drift introduced by the incident window.
6. **Notification logs, audit logs** — lower immediate priority for restoring
   service, but valuable for post-incident analysis; do not deprioritize them out
   of the backup scope entirely.

## 4. Data-Loss Scenarios to Plan For

| Scenario | Current preparedness |
|---|---|
| Accidental destructive query by an operator with service-role access | Mitigated only by discipline + (if configured) Supabase PITR; no application-level "undo" exists |
| Bad migration deployed to production | Migrations are additive/historical by program rule (no editing old migrations) — recovery is a forward-fix migration, not a rollback of schema; verify PITR could recover pre-migration state if truly destructive |
| Supabase regional outage | Outside Revora's control; depends on Supabase's own SLA/redundancy for the project's region |
| Storage bucket object accidentally deleted | Depends on Supabase Storage's own backup/versioning support for the plan tier — not confirmed |

## 5. Recommended Next Steps (not implemented in this pass)

1. DevSecOps Owner to log into the Supabase dashboard for project
   `yqscayjvvnpsvocqrrot` and document the actual backup/PITR configuration,
   replacing the "confirm operationally" checklist above with verified facts.
2. Schedule a first restore drill once a non-production Supabase project is
   available to restore into.
3. Define a target Recovery Point Objective (RPO) and Recovery Time Objective
   (RTO) once real customer volume justifies formalizing this — premature to set
   numeric targets before there is production traffic to size them against.
