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
