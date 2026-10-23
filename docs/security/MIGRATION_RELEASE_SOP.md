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

Run these sequentially. `pretypecheck` runs `next typegen`, so `typecheck` and
`build` race over generated state if run concurrently.

```bash
cd apps/web
pnpm lint && pnpm typecheck && pnpm build && pnpm test
pnpm audit:migrations            # MIGRATION_NUMBERING_OK + MIGRATION_SAFETY_*
pnpm audit:tenant-fks            # TENANT_FK_AUDIT_OK
pnpm audit:approval-path         # APPROVAL_PATH_CANONICAL

# Privilege detectors. Run each self-test FIRST: it is the positive control
# that proves the detector can still fail. A detector that has only ever
# printed OK has proved nothing.
pnpm audit:views:self-test       # VIEW_SECURITY_SELFTEST_OK
pnpm audit:views                 # VIEW_SECURITY_AUDIT_OK
pnpm audit:functions:self-test   # FUNCTION_PRIVILEGE_SELFTEST_OK
pnpm audit:functions             # FUNCTION_PRIVILEGE_AUDIT_OK

pnpm test:db:all                 # every suite, then both audits
```

If the migration adds a VIEW, or any function, read `0047`'s header before
writing it: a view runs as its OWNER unless `security_invoker = true` is set,
and PostgreSQL grants `EXECUTE` on every new function to `PUBLIC`. Both defaults
are open, both have shipped as live holes here, and both detectors above exist
because the 210 table-shaped test cases cannot see either one.

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

## 6. Merging is the deployment. Order what you can, then verify.

**Merging a migration PR to `main` is itself production authorization.** Treat
the merge button as the apply step, because it is.

### What the merge triggers, with no further action

The Supabase GitHub integration is configured to deploy from `main`. Supabase
documents the behaviour: *"changes pushed to `main` are automatically
deployed"*, and for the GitHub integration, *"automatically deploy changes when
you push or merge to production branch... New migrations are applied."*
Observed on the 0039-0046 release: the migrations were applied roughly 37
seconds after the merge, while the matching Vercel deployment did not report
READY until about 2m09s after it.

So, on merge:

* New migrations are applied to **production**, directly. This project is on
  the **free** plan, so Supabase Branching is unavailable and there is no
  preview environment between the PR and production.
* Edge Functions and storage buckets declared in `config.toml` are deployed.
* Vercel builds and promotes the matching application commit **afterwards**.

This has a consequence the previous version of this section got wrong: it
instructed the operator to merge, wait for the Vercel deployment to go green,
and then apply the migration in the same maintenance step. That sequence is not
available. The schema is already changed before the deployment is ready, and for
a window of roughly two minutes **production schema is ahead of production
code**. You cannot order those two events from here; you can only decide whether
that window is safe, and verify both ends afterwards.

### Classify the change before you merge

**Schema-only, privilege-reducing** (for example `0047`, which sets
`security_invoker` and revokes grants): the window is safe in one direction.
Reducing a privilege the deployed code never used cannot break the running
application. Confirm that claim explicitly — grep the app for every object whose
privileges change, and confirm the roles that keep access are the ones the code
actually uses — then merge on its own.

**Schema/application coupled** (for example
`0040_canonical_approval_path.sql`, which revokes `INSERT` on
`public.approvals` from `authenticated` and requires the commit that routes
approvals through `submit_quote_approval()`): the window is **not** safe. The
old code is live against the new schema for about two minutes and will fail.
Make the change tolerate both states instead of trying to sequence it:

1. Ship the code first, in its own PR, written to work against the old schema
   **and** the new one.
2. Let that deployment go READY.
3. Merge the migration PR second.

An expand/contract pair is two PRs, not one maintenance step. If a change
genuinely cannot be split, say so on the PR and schedule it as an announced
window, because the two-minute mismatch is unavoidable.

### Immediately before merge

* Re-read the diff. The migration you reviewed is the one that will apply.
* `pnpm audit:migrations` is green on your branch. It is also meaningful after
  the merge: on `main` itself the safety half audits what the merge brought in
  along its first parent (`HEAD^1..HEAD`), rather than diffing `main` against
  itself and finding nothing. A change that adds no migration reports
  `MIGRATION_SAFETY_NOT_APPLICABLE` and passes; only an unresolvable base
  reports `MIGRATION_SAFETY_UNAVAILABLE` and fails.
* The Supabase integration check on the PR has passed. Keep it as a GitHub
  **required check**: Supabase recommends it precisely so a failing migration
  cannot be merged.
* You have decided which class the change is, and are merging in that order.

### Immediately after merge

```bash
# 1. The applied schema version is the one you merged.
#    (supabase_migrations.schema_migrations has no timestamp column, so check
#    the version, not a time.)
# 2. The deployed Vercel commit is the one you merged.
# 3. Re-run the privilege detectors against production's advisors:
#      Supabase Dashboard -> Advisors -> Security
# 4. Smoke the routes the change touches.
```

Both ends must be the versions you intended. If the migration applied and the
deployment failed, you are left with schema ahead of code and must either fix
forward or revert the application commit — see section 8. There is no PITR to
fall back on.

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
2. The automatic daily backup, for a destructive mistake. Note the limits:
   this organization is on the **free** plan (verified), so there is **no
   point-in-time recovery**. A daily backup is the only restore point, and
   restoring it discards everything written since it was taken.

**Plan as if recovery is forward-only, because in practice it is.** That is why
no migration in this repository deletes, truncates or rewrites data, and why
`0039`'s census raises on corrupt rows instead of repairing them. A migration
that needs a rollback plan beyond "write the inverse migration" needs the
owner's sign-off before it is merged, not after.

Because every migration in this repository is additive or privilege-reducing,
option 1 is normally sufficient. For a privilege reduction the inverse is the
matching `grant`; for `0047` specifically it is `alter view ... set
(security_invoker = false)` plus the grants it revoked, which should only ever
be written with the owner's explicit decision, since it reopens a proven
cross-tenant hole.

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
