# Gates: Meta and WhatsApp inbound route handlers

OWNS: apps/web/src/lib/inbound/**, apps/web/src/app/api/inbound/**, apps/web/tests/inbound-capture.test.mjs, supabase/migrations/0049_inbound_rate_limit_scope.sql, apps/web/src/lib/database.types.ts, apps/web/src/lib/env.ts

Scope: Signature-verified inbound routes for Instagram DMs, Messenger, Meta
lead ads and the WhatsApp Cloud API, on one shared verifier. A valid signature
is accepted and every forgery, tamper and malformed variant is refused; payload
normalisation drops echoes and delivery receipts instead of turning them into
leads; the tenant is resolved from the correct field per surface; the unverified
path is rate-limited through the 0044 limiter; and nothing in the existing
offline or database suites regresses.

NOT GATED HERE, deliberately: the PostgREST embed audit. `audit-embeds` and its
script live on the unmerged fix/postgrest-ambiguous-embeds work and are absent
from main, which this branch is cut from. R8 instead proves the new code
introduces no embed at all, which is what would have made that audit relevant.

Run with: node <skill-dir>/scripts/gate-check.mjs --timeout 600 <this file>

- [x] R1: The inbound unit suite passes, including the positive control that a
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=ℹ pass 27 | ℹ fail 0
      correctly computed Meta signature IS accepted — without which every
      rejection case would be satisfied by a verifier that refuses everything.
  CHECK: node --test tests/inbound-capture.test.mjs 2>&1 | grep -E "(pass|fail) [0-9]+$"
  EXPECT: /pass 27[\s\S]*fail 0/
  CWD: ../../apps/web

- [x] R2: The whole offline suite still passes, so the new modules and the
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=ℹ pass 457 | ℹ fail 0
      database.types.ts additions regress nothing.
  CHECK: pnpm test 2>&1 | grep -E "(pass|fail) [0-9]+$"
  EXPECT: /pass 457[\s\S]*fail 0/
  CWD: ../../apps/web

- [x] R3: Lint and typecheck are clean with the new routes, modules and types.
  CHECK: pnpm lint && pnpm typecheck && echo ROUTES_LINT_TYPECHECK_OK
  EXPECT: ROUTES_LINT_TYPECHECK_OK
  CWD: ../../apps/web
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=* /Users/Madds/Downloads/Revora-app/apps/web/pnpm-lock.yaml | $ tsc --noEmit

- [x] R4: Migration 0049 collides with no existing number and is the newest.
  CHECK: node scripts/audit-migration-collisions.mjs
  EXPECT: MIGRATION_NUMBERING_OK
  CWD: ../../apps/web
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=numbers=48 refs_scanned=61 highest=0049 collisions=0 | MIGRATION_NUMBERING_OK

- [x] R5: The full migration set, 0048 and 0049 included, applies from zero to
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=[db-test] recreating database revora_sec_test | [db-test] applying supabase shim
      a real PostgreSQL.
  CHECK: node scripts/db-test.mjs --reset
  EXPECT: DB_SCHEMA_OK
  CWD: ../../apps/web

- [x] R6: Every Stage 0 database case passes, now including the limiter: the
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=INBOUND_CAPTURE_OK | psql:<stdin>:94: NOTICE:  table "_inb_results" does not exist, skipping
      inbound scope is allowlisted, an unknown scope fails closed, and neither
      anon nor authenticated can call the limiter directly to burn a bucket.
  CHECK: node scripts/db-test.mjs --run ../../supabase/tests/inbound_capture_tests.sql
  EXPECT: INBOUND_CAPTURE_OK
  CWD: ../../apps/web

- [x] R7: Every tenant parent/child reference still has a composite guarantee
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=relations=98 covered=98 uncovered=0 | TENANT_FK_AUDIT_OK
      after 0049.
  CHECK: node scripts/audit-tenant-fks.mjs
  EXPECT: TENANT_FK_AUDIT_OK
  CWD: ../../apps/web

- [x] R8: The embed detector can actually detect a PostgREST embed and does
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=self-test cases=7 failures=0 | INBOUND_EMBED_AUDIT_SELF_TEST_OK
      not fire on a flat select (positive control for R9).
  CHECK: node scripts/audit-inbound-embeds.mjs --self-test
  EXPECT: INBOUND_EMBED_AUDIT_SELF_TEST_OK
  CWD: ../../apps/web

- [x] R9: The inbound code issues no PostgREST embed, so the PGRST201
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=files=7 embeds=0 | INBOUND_EMBED_AUDIT_OK
      ambiguity class cannot apply to it — the property the absent
      audit-embeds script would otherwise have had to check.
  CHECK: node scripts/audit-inbound-embeds.mjs
  EXPECT: INBOUND_EMBED_AUDIT_OK
  CWD: ../../apps/web
