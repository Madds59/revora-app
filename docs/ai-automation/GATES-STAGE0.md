# Gates: Stage 0 inbound capture schema (migration 0048)

OWNS: supabase/migrations/0048_inbound_capture.sql, supabase/tests/inbound_capture_tests.sql, docs/ai-automation/STAGE0_INBOUND_CAPTURE_DESIGN.md, apps/web/package.json

Scope: The Stage 0 schema — leads, lead_messages, channel_identities plus the
two tables the signed inbound routes require — applies to a real PostgreSQL,
resolves tenants structurally, refuses cross-tenant attachment with RLS both
enforced and bypassed, keeps the pre-tenant webhook table unreachable by anon
and authenticated, grants no portal access, and regresses none of the repo's
existing schema audits.

Gates run in order and share the database the first one builds. G8 is last
because it deliberately rebuilds the schema one migration earlier.

Run with: node <skill-dir>/scripts/gate-check.mjs --timeout 600 <this file>

- [x] G1: Migration 0048 applies cleanly as the newest migration against a real
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=[db-test] recreating database revora_sec_test | [db-test] applying supabase shim
      PostgreSQL, from zero, with every prior migration.
  CHECK: node scripts/db-test.mjs --reset
  EXPECT: DB_SCHEMA_OK
  CWD: ../../apps/web

- [x] G2: Every Stage 0 security case passes — tenant resolution, cross-tenant
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=INBOUND_CAPTURE_OK | psql:<stdin>:94: NOTICE:  table "_inb_results" does not exist, skipping
      refusal with RLS bypassed, the unreachable pre-tenant table, absence of
      portal access, AI attribution — including the same-tenant ACCEPT controls
      that prove the refusals are not "nothing can be written at all".
  CHECK: node scripts/db-test.mjs --run ../../supabase/tests/inbound_capture_tests.sql
  EXPECT: INBOUND_CAPTURE_OK
  CWD: ../../apps/web

- [x] G3: Every tenant-owned parent/child reference in the whole schema,
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=relations=98 covered=98 uncovered=0 | TENANT_FK_AUDIT_OK
      including the six new composite foreign keys, has a composite guarantee.
      Measured from the catalog, not a hand-maintained list.
  CHECK: node scripts/audit-tenant-fks.mjs
  EXPECT: TENANT_FK_AUDIT_OK
  CWD: ../../apps/web

- [ ] G4: Stage 0 introduces no new PostgREST relationship ambiguity, so no
      embed from these tables can fail with PGRST201 and render as a false
      empty state.
ABANDON: G4 Impossible on this base. This branch is cut from main, and audit-postgrest-embeds.mjs is not on main: it lives on the unmerged fix/postgrest-ambiguous-embeds work (PR #27). The earlier measurement (files=444 ambiguous_pairs=111 violations=0) was taken on that branch's base and cannot be reproduced here, so it is not carried forward as evidence. For the inbound code the property is superseded by GATES-STAGE0-ROUTES R8/R9, which prove it issues no embed at all. The /leads UI will need the real audit, so this needs the owner to decide whether PR #27 merges to main first.

- [x] G5: The pre-existing cross-tenant integrity suite still passes against
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=TENANT_INTEGRITY_OK | psql:<stdin>:86: NOTICE:  table "_sec_results" does not exist, skipping
      the schema with 0048 applied — the new tables regress nothing.
  CHECK: node scripts/db-test.mjs --run ../../supabase/tests/tenant_parent_integrity_tests.sql
  EXPECT: TENANT_INTEGRITY_OK
  CWD: ../../apps/web

- [x] G6: The repository's own validation passes with the package.json change.
  CHECK: pnpm lint && pnpm typecheck && echo STAGE0_LINT_TYPECHECK_OK
  EXPECT: STAGE0_LINT_TYPECHECK_OK
  CWD: ../../apps/web
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=* /Users/Madds/Downloads/Revora-app/apps/web/pnpm-lock.yaml | $ tsc --noEmit

- [x] G7: The new suite is wired into test:db:all, so it runs with the rest of
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=STAGE0_SUITE_WIRED_OK
      the database security suites rather than only by hand.
  CHECK: node -e "const s=require('./package.json').scripts;if(!s['test:db:inbound'])throw new Error('script missing');if(!s['test:db:all'].includes('test:db:inbound'))throw new Error('not in test:db:all');if(!s['test:db:inbound:positive-control'])throw new Error('positive control missing');console.log('STAGE0_SUITE_WIRED_OK')"
  EXPECT: STAGE0_SUITE_WIRED_OK
  CWD: ../../apps/web

- [x] G8: Positive control — at schema 0047 the Stage 0 tables do not exist and
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=STAGE0_POSITIVE_CONTROL_OK
      the same suite refuses instead of passing, so a green G2 cannot be a
      vacuous run. Deliberately leaves the test database one migration back.
  CHECK: node scripts/db-test.mjs --reset --up-to 0047 --run ../../supabase/tests/inbound_capture_tests.sql 2>&1 | grep -q "Stage 0 schema missing" && echo STAGE0_POSITIVE_CONTROL_OK
  EXPECT: STAGE0_POSITIVE_CONTROL_OK
  CWD: ../../apps/web
