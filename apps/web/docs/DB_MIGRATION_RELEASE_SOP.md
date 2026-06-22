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
9. Run verification SQL.
10. Run browser QA for affected features.

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

## Post-Migration Browser QA

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
- Browser QA shows cross-tenant or cross-customer leakage.
