# Migration release SOP

Referenced by `supabase/migrations/0038_legal_compliance_hardening.sql` and
`0039_cross_tenant_parent_integrity.sql`. This file is the procedure those
migrations point at.

Revora's schema is **forward-only**. An applied migration is never edited: a
mistake is corrected by a new, higher-numbered migration.

## 1. Pick a collision-free number

`ls supabase/migrations` on your branch is **not** sufficient. Numbers 0031,
0032 and 0033 exist only on `security/appsec-10-auth-hardening`, so they look
free on `main` and are not. Numbers must be unique across every ref that could
merge.

```bash
cd apps/web
pnpm audit:migrations
```

Expects `MIGRATION_NUMBERING_OK`. It scans every local and remote ref, plus
uncommitted files, and also asserts the new migrations contain no destructive
statement (`MIGRATION_SAFETY_OK`).

## 2. Apply from zero against a real database

```bash
cd apps/web
pnpm test:db          # reset, apply every migration, run the integrity suite
```

Expects `DB_SCHEMA_OK` then `TENANT_INTEGRITY_OK`. This builds the schema from
`0001` in a disposable database — never the dev database; `scripts/db-test.mjs`
refuses to target `postgres`.

## 3. Apply from the production-equivalent state

Production's applied set is authoritative and is **not** every file in the
directory (it has no 0028 and no 0031–0033). Confirm with the Supabase MCP
`list_migrations`, then rehearse the upgrade from exactly that state:

```bash
cd apps/web
node scripts/db-test.mjs --reset --up-to <current production version>
node scripts/db-test.mjs --run ../../supabase/tests/<your test>.sql
```

## 4. Prove the security property can fail

A security migration needs a positive control: run the suite against the
schema **before** the fix and confirm it reports failure. A suite that cannot
fail certifies nothing.

```bash
cd apps/web
pnpm test:db:positive-control   # must print TENANT_INTEGRITY_FAILED
```

CI enforces this (the `db-security` job fails if the pre-fix schema looks
clean).

## 5. Run the full gate set

```bash
cd apps/web
pnpm lint && pnpm typecheck && pnpm build && pnpm test
pnpm audit:tenant-fks        # TENANT_FK_AUDIT_OK
pnpm audit:approval-path     # APPROVAL_PATH_CANONICAL
```

## 5b. Regenerate the database types when app code will use the change

`apps/web/src/lib/database.types.ts` is generated. A migration that only adds
schema does not require it — nothing references the new entities yet and
`pnpm typecheck` passes — but the first code that touches them does.

Generate from a freshly reset test database, not from production (production is
one or more migrations behind by definition at this point):

```bash
cd apps/web
node scripts/db-test.mjs --reset
cd ..
npx supabase@<the version the team pins> gen types typescript \
  --db-url 'postgresql://postgres:postgres@127.0.0.1:54322/revora_sec_test' \
  > apps/web/src/lib/database.types.ts
```

Reset first: the SQL harnesses create `_sec_results` / `_fin_results` /
`_aud_results` / `_trr_results` tables, and generating after a test run emits
types for them.

Pin the CLI version. The committed file was produced by an older CLI that
emitted formatted output; 2.121.0 emits compact output and no formatter is
installed in this workspace, so generating with a newer CLI rewrites all ~5000
lines and buries the real change. Match the version that produced the file in
tree, or format the result the same way, before committing it.

## 6. Deploy schema and code together

Some migrations change the privilege surface the application depends on.
`0040_canonical_approval_path.sql` revokes `INSERT` on `public.approvals` from
`authenticated`, so the matching application commit — which routes approvals
through `submit_quote_approval()` — **must** ship with it.

> Never leave production schema ahead of production code, or code ahead of
> schema. For a coupled change, merge the PR, let the Vercel deployment for
> that commit go green, and apply the migration in the same maintenance step.

Verify alignment afterwards: the deployed commit and the applied migration
version must both be the ones you intended.

## 7. If the APPSEC-18 census refuses to apply

`0039` begins with a census that counts rows whose `business_id` disagrees with
their parent's, and **raises** rather than constraining corrupt data. If it
raises:

1. Do not delete the rows, and do not weaken the constraint to get past it.
   Those rows are evidence.
2. Re-run the census as a read-only query to get the per-relation counts (the
   exception message lists them).
3. For each relation decide, with the owner, whether the correct repair is to
   re-point the child at its true parent or to quarantine it for review.
4. Record the decision and the affected ids before changing anything.

The invariant itself is enumerated by
`public.tenant_parent_child_relations()`, which is the single source the
census, the constraint builder and `pnpm audit:tenant-fks` all read.

## 8. Rollback

Forward-only means there is no `down` migration. Recovery options, in order of
preference:

1. A new migration that reverses the change (preferred).
2. Supabase Point-in-Time Recovery / the automatic daily backup, for a
   destructive mistake. **Confirm the project's backup tier covers the window
   you need before relying on this** — PITR is not available on every plan.

Because every migration in this repository is additive, option 1 is normally
sufficient.

## 9. Deferred: tightening `is_super_admin()` to require MFA (aal2)

Migration `0045_admin_mfa_assurance_helpers.sql` ships the assurance predicates
but **deliberately does not** tighten `is_super_admin()`. This section is the
rest of that change, held back because applying it today is an outage.

### The gap it closes

The MFA gate in middleware is a **routing** control: it stops an aal1 admin
reaching `/admin` in a browser. It does nothing about a stolen admin credential
used to `POST /rest/v1/rpc/admin_list_users` directly at PostgREST with an aal1
token. That is the admin **data** surface, and it is open.

### Why it is not applied

Measured against production:

| | |
|---|---|
| `platform_admins` | 2 |
| verified MFA factors | **0** |
| admins who could reach aal2 | **0** |

Applying it now revokes admin data access from **both** platform admins, with
no enrolled factor to recover through.

### Preconditions

1. Enable MFA on the Supabase project (Authentication → providers).
2. Every platform admin enrols and **verifies** a TOTP factor.
3. Confirm readiness — every row must read `t`:

   ```sql
   select * from public.admin_aal2_readiness();
   ```

   An `unverified` factor does not count; the function only credits `verified`.

### The change, as a new migration

```sql
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path to 'public'
as $$ select public.has_admin_aal2(); $$;

comment on function public.is_super_admin() is
  'Platform-admin authority: platform_admins membership AND aal2 (MFA), enforced at the database boundary independently of Next.js middleware.';
```

It covers **17** privileged functions, not the 14 matching `admin\_%`: three
more (`get_business_revenue_summary`, `get_business_revenue_trend`,
`list_business_billing_invoices`) reach admin authority through
`is_super_admin()` as an `OR` branch. Tightening the helper covers every
present and future caller at one point.

Ordinary business users are unaffected: tenant-scoped functions are guarded as
`if not is_business_member(...) and not is_super_admin()`, so a member passes on
the first branch regardless of assurance level. No RLS policy references
`is_super_admin`, so no read path changes.

### Rollback

```sql
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()); $$;
```

This is the correct emergency action if admins are locked out. It reopens the
aal1 PostgREST bypass, so treat it as temporary and re-apply once enrolment is
possible. Update the comment on `is_super_admin()` either way — the
`auth_hardening_tests.sql` case `is_super_admin_residual_is_documented` asserts
the comment matches reality, and will fail if the two drift apart.
