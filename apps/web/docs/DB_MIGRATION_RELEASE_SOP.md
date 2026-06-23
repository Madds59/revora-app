# Database Migration Release SOP

## Current Migration Governance

Known migration slots:

- `0025` = Retainer Calculator
- `0026` = Membership Bundles
- `0027` = Business Ratings
- `0028` = intentionally skipped / historical slot
- `0029` = Launch Ops Foundation
- F5 = `0030` or next available if schema is needed

Do not create or modify migrations unless the task explicitly includes migration work.

## Approval Rules

- Every migration requires review before application.
- Additive migrations still require approval.
- RLS, grants, indexes, triggers, and functions must be reviewed as part of the migration.
- Destructive changes require explicit written approval and a rollback/mitigation plan.
- Production migration application must be operator-controlled.
- Never run destructive Supabase commands against production.
- Never run `supabase db reset`, `supabase db pull`, destructive SQL, or migration repair against production.

## Safe Migration Review

Review without reading `.env` files or exposing credentials:

```bash
cd ~/Downloads/Revora-app
git diff -- supabase/migrations
git diff --name-only origin/main...HEAD
```

Check:

- Filename number is correct and not reserved.
- SQL is additive unless approved otherwise.
- New tenant-owned tables include `business_id`.
- RLS is enabled for tenant-owned tables.
- Policies scope through `business_members`, customer link records, or platform admin records as appropriate.
- Privileged operations use narrowly scoped SECURITY DEFINER functions.
- Functions set `search_path` safely.
- Indexes exist for foreign keys, `business_id`, status fields, and common lookup filters.
- No secrets, keys, passwords, or environment values appear.

## Credential Handling

- Do not read `.env` files.
- Do not print Supabase service-role keys.
- Do not paste credentials into chat or docs.
- Do not commit generated local config containing secrets.
- Use operator-provided environment exports only when explicitly required and never echo them.

## Supabase SQL Editor Manual Application Checklist

For production SQL Editor application:

1. Confirm target project ref with the operator.
2. Confirm current production commit and release branch.
3. Review the migration SQL in Git.
4. Confirm the migration number and purpose.
5. Confirm no destructive SQL exists.
6. Confirm RLS and policy impact.
7. Apply during an approved release window.
8. Capture success/failure status without copying secrets.
9. Run verification SQL (table existence, RLS, policies, grants, indexes).
10. **Reload the PostgREST schema cache** (see "PostgREST Schema Cache Reload" below). REQUIRED whenever the migration adds or renames a table, column, or foreign key — otherwise the REST API returns `PGRST205` even though the SQL succeeded. This is the exact failure that blocked Launch Ops (`0029`).
11. Wait 30–60 seconds, then verify direct table access through the API/app path.
12. Run authenticated browser QA for affected features. HTTP smoke/curl is **not** a substitute (see the warning under "Post-Migration Browser QA").

## Verification SQL Snippets

Table existence:

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('expected_table_name')
order by table_name;
```

RLS enabled:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('expected_table_name')
order by tablename;
```

Policies present:

```sql
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('expected_table_name')
order by tablename, policyname;
```

Function existence:

```sql
select n.nspname as schema, p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('expected_function_name')
order by p.proname;
```

Index existence:

```sql
select schemaname, tablename, indexname
from pg_indexes
where schemaname = 'public'
  and tablename in ('expected_table_name')
order by tablename, indexname;
```

Quick existence check (returns `NULL` if the table is not present in this database):

```sql
select to_regclass('public.expected_table_name') as table_name;
```

If `to_regclass` returns `NULL`, the migration was **not applied** to the database the app connects to — confirm the project ref with the operator and re-apply through the approved process. A `NULL` result here is different from "table exists but the API can't see it" (a stale schema cache — see below).

Grants present (PostgREST enforces table privileges in addition to RLS):

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'expected_table_name'
  and grantee in ('authenticated', 'anon', 'service_role')
order by grantee, privilege_type;
```

## PostgREST Schema Cache Reload (REQUIRED after schema-shape changes)

Supabase's REST API (PostgREST) serves an **in-memory schema cache**. When a migration adds or renames a **table, column, or foreign key** — especially when applied manually via the SQL Editor — PostgREST may not see it until the cache is reloaded. Until then the API returns:

```
PGRST205: Could not find the table 'public.<table>' in the schema cache
```

This is exactly what blocked Launch Ops (`0029`): the tables existed and RLS was correct, but the API could not see them until the cache was reloaded.

Mandatory steps after any schema-shape migration:

1. Reload the schema cache:

   ```sql
   NOTIFY pgrst, 'reload schema';
   ```

   (Equivalently, use the Supabase Dashboard "Reload schema cache" control if your plan exposes it.)

2. Wait **30–60 seconds** for the reload to propagate.

3. Verify direct table access through the API/app path (not just raw SQL):

   ```sql
   select 1 from public.expected_table_name limit 1;
   ```

   then confirm the affected page loads in the app with **no** `PGRST205`.

The schema cache is **per Supabase project** and shared by every deployment (production and previews) pointing at that project. One reload fixes all environments using that project; no per-deployment reload is needed.

## PGRST205 and Schema-Cache Troubleshooting

When a migrated feature fails to read/write data, use this decision guide:

- **`to_regclass(...)` returns `NULL`** → the table does not exist in this database. The migration was not applied here (wrong project, or not applied). Re-apply via the approved process; do not rerun partial migrations blindly.
- **SQL works in the SQL Editor but the app/API returns `PGRST205`** → the table exists but the PostgREST schema cache is stale, or the app points at a different project. Run `NOTIFY pgrst, 'reload schema';`, wait, and re-test. Confirm the app's project ref matches the database you applied to.
- **Reads return empty (no error) where data should exist** → this is **RLS denying rows**, not a cache problem. The error signature differs from `PGRST205`; diagnose the policy, not the cache.
- **A read errors but the page still "looks fine"** → a page may catch the error and render defaults (during the `0029` incident the Implementation Center fell back to defaults while the feedback inbox surfaced the error). A working-looking page is **not** proof the migrated table is readable — verify each migrated read path explicitly.

Repair discipline:

- Do not manually `drop` tables/policies to "fix" a partial migration.
- Use idempotent repair SQL (`create ... if not exists`, `create or replace`, guarded `alter`) only **after** diagnosing the partial state, and only with operator approval.
- Never run destructive repair against production.

## Standard Grants Guidance

PostgREST enforces standard SQL **table privileges** in addition to RLS. A table can have correct RLS and still be unreadable by the API if `authenticated` / `anon` / `service_role` lack `select` / `insert` / `update`.

- New app-facing tables must be reachable by the same roles as the project's existing tenant tables. Follow the **existing grant convention** in the migration history: default privileges are configured in `0003_api_grants.sql`, and several feature migrations also grant explicitly. New tables should inherit or restate that pattern.
- After a manual apply, run the "Grants present" check above. If the expected roles are missing privileges, the table needs the standard grants (matching the project convention) before the feature will work.
- **Do not** add grants to already-applied migration files. A grant correction to a live database is an operator-approved DB action, and any new grant SQL belongs in a **new, approved migration** — never an edit to a historical one.

## Post-Migration Browser QA

> **HTTP smoke/curl is not a substitute for authenticated browser QA.** Route smoke and `curl` confirm that pages resolve and redirect correctly, but unauthenticated requests redirect *before* reaching the migrated tables — so they cannot detect `PGRST205`, RLS failures, or broken reads/writes. Always sign in and exercise the actual data paths (owner and customer) for any migration that backs user-visible data.

After applying a migration:

- Verify signed-out route protection.
- Verify owner/staff access to affected tenant data.
- Verify customer access to affected portal data.
- Verify cross-tenant RLS isolation.
- Verify create/update/delete behavior affected by the migration.
- Verify localized EN/AR surfaces if the migration supports user-visible data.
- Verify no raw database IDs appear as primary labels.
- Verify audit and notification side effects where applicable.

## Stop Conditions

Stop immediately if:

- Migration number collides.
- SQL is destructive without approval.
- RLS is missing on tenant-owned data.
- A service-role key or JWT appears in SQL, diffs, docs, or logs.
- Verification SQL contradicts expected schema state.
- The REST API still returns `PGRST205` for a migrated table after a schema-cache reload and a 30–60s wait (indicates a project mismatch or an unapplied migration, not just cache lag).
- Browser QA shows cross-tenant or cross-customer leakage.
