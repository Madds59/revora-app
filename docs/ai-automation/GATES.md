# Gates: AI automation catalog, inquiry to retention

OWNS: docs/ai-automation/**, scripts/audit-ai-catalog.mjs

Scope: A catalog of every AI automation and agentic-AI opportunity in Revora,
covering the consumer journey from first inbound inquiry (social DM, Meta ad,
phone call) through to retention, platform administration and the remaining
possibilities. Every automation names the real table, route and helper it
would hook into, so the document is actionable rather than generic. Claims
about what already exists are measured against the migrations and app tree,
not asserted.

- [x] G1: The auditor catches a fabricated table, a fabricated route, a
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app; path=532a6879ab00/19 entries; output=self-test cases=10 failures=0 | AI_CATALOG_AUDIT_SELF_TEST_OK
      fabricated helper symbol, a "(new)" marker on something that already
      exists, and a document missing lifecycle stages; and clears all five
      honest forms (positive control for G2 and G3).
  CHECK: node scripts/audit-ai-catalog.mjs --self-test
  EXPECT: AI_CATALOG_AUDIT_SELF_TEST_OK
  CWD: ../..

- [x] G2: Every table, route and helper the catalog cites as existing is
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app; path=532a6879ab00/19 entries; output=tables_cited=119 routes_cited=47 symbols_cited=25 proposed=13 schema_tables=71 app_routes=99 entries=68 stages_missing=0 | AI_CATALOG_AUDIT_OK
      present in supabase/migrations or apps/web/src, and everything marked
      "(new)" is genuinely absent today.
  CHECK: node scripts/audit-ai-catalog.mjs docs/ai-automation/AI_AUTOMATION_CATALOG.md
  EXPECT: AI_CATALOG_AUDIT_OK
  CWD: ../..

- [x] G3: The catalog covers all thirteen lifecycle stages (0 through 12) and
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app; path=532a6879ab00/19 entries; output=tables_cited=119 routes_cited=47 symbols_cited=25 proposed=13 schema_tables=71 app_routes=99 entries=68 stages_missing=0 | AI_CATALOG_COVERAGE_OK
      carries at least 40 numbered automation entries, so no stage of the
      requested journey is silently dropped.
  CHECK: node scripts/audit-ai-catalog.mjs docs/ai-automation/AI_AUTOMATION_CATALOG.md --coverage
  EXPECT: AI_CATALOG_COVERAGE_OK
  CWD: ../..

- [x] G4: The catalog states the inbound-capture finding explicitly — that no
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app; path=532a6879ab00/19 entries; output=CAPTURE_GAP_STATED_OK
      leads/inquiry table and no inbound webhook route exist today — rather
      than listing social, ads and phone automations as if the entry point
      were already built.
  CHECK: node -e "const t=require('fs').readFileSync('docs/ai-automation/AI_AUTOMATION_CATALOG.md','utf8');const hits=['no inbound','does not exist','Stage 0'].filter(s=>t.includes(s));if(hits.length<3){console.error('missing: '+['no inbound','does not exist','Stage 0'].filter(s=>!t.includes(s)).join(', '));process.exit(1)}console.log('CAPTURE_GAP_STATED_OK')"
  EXPECT: CAPTURE_GAP_STATED_OK
  CWD: ../..

- [x] G5: The repository's own validation passes on the added script, so the
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app; path=532a6879ab00/19 entries; output=AUDIT_SCRIPT_AND_LINT_OK | $ eslint
      catalog's tooling does not break the build it documents.
  CHECK: node --check scripts/audit-ai-catalog.mjs && pnpm --dir apps/web lint && echo AUDIT_SCRIPT_AND_LINT_OK
  EXPECT: AUDIT_SCRIPT_AND_LINT_OK
  CWD: ../..
