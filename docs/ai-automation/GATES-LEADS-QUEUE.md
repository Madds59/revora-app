# Gates: /leads work queue UI

OWNS: apps/web/src/app/[locale]/(dashboard)/leads/**, apps/web/src/lib/leads.js, apps/web/src/lib/leads-types.ts, apps/web/src/lib/validation/leads.js, apps/web/tests/leads-queue.test.mjs

Scope: A work queue for inbound leads — list with search, status and channel
filters, a thread view, triage (status, urgency, owner) and conversion to a
customer. The vocabularies the UI offers match what migration 0048's check
constraints accept, both locales are complete, no client-supplied business_id
is ever honoured, and the module is feature-gated and off by default.

Counts are FLOORS, not exact figures, per the project's own rule that an exact
test-count assertion rots the moment the suite grows. Exact measurements go in
the evidence line.

Run with: node <skill-dir>/scripts/gate-check.mjs --timeout 600 <this file>

- [x] L1: The leads suite passes, including the checks that the status, urgency
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=ℹ pass 17 | ℹ fail 0
      and channel vocabularies are exactly those 0048 allows, that both locales
      are complete and genuinely translated, and that neither schema accepts a
      client-supplied business_id.
  CHECK: node --test tests/leads-queue.test.mjs 2>&1 | grep -E "(pass|fail) [0-9]+$"
  EXPECT: /pass (1[7-9]|[2-9][0-9]|[1-9][0-9]{2,})[\s\S]*fail 0/
  CWD: ../../apps/web

- [x] L2: The whole offline suite still passes, so the feature-registry change
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=ℹ pass 484 | ℹ fail 0
      and the new nav item regress nothing.
  CHECK: pnpm test 2>&1 | grep -E "(pass|fail) [0-9]+$"
  EXPECT: /pass (48[4-9]|49[0-9]|[5-9][0-9]{2}|[1-9][0-9]{3,})[\s\S]*fail 0/
  CWD: ../../apps/web

- [x] L3: Lint and typecheck are clean across the new pages, client components
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=* /Users/Madds/Downloads/Revora-app/apps/web/pnpm-lock.yaml | $ tsc --noEmit
      and server actions.
  CHECK: pnpm lint && pnpm typecheck && echo LEADS_LINT_TYPECHECK_OK
  EXPECT: LEADS_LINT_TYPECHECK_OK
  CWD: ../../apps/web

- [x] L4: A production build succeeds and emits both lead routes. This is the
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=2 | LEADS_BUILD_OK
      check that catches server/client boundary mistakes, which typecheck does
      not: a client hook in a server component compiles but fails at build.
  CHECK: pnpm build 2>&1 | grep -cE "/\[locale\]/leads" && pnpm build 2>&1 | grep -q "/\[locale\]/leads/\[id\]" && echo LEADS_BUILD_OK
  EXPECT: LEADS_BUILD_OK
  CWD: ../../apps/web

- [x] L5: The queue introduces no PostgREST relationship ambiguity. The list
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/Madds/Downloads/Revora-app/apps/web; path=532a6879ab00/19 entries; output=files=460 ambiguous_pairs=111 violations=0 | POSTGREST_EMBED_AUDIT_OK
      and detail pages use flat selects and separate lookups, so a PGRST201
      cannot render as a false empty state here.
  CHECK: node scripts/audit-postgrest-embeds.mjs
  EXPECT: POSTGREST_EMBED_AUDIT_OK
  CWD: ../../apps/web

- [ ] L6: The queue renders correctly in a browser with real leads in it —
      list, both filters, the thread, triage and conversion.
ABANDON: L6 Not verified, and not verifiable here. The page needs an authenticated session against the LOCAL dev database, and that database is at migration 0033 while these tables arrive in 0048 — a 16-migration jump across the developer's own development data, including 0035 tenant-isolation hardening and 0041 invoice invariants whose new constraints existing dev rows may violate. That is an owner decision, not a step I should take to make a gate green. What WAS verified: both routes compile and appear in the production build (/[locale]/leads and /[locale]/leads/[id]), /en/leads resolves and the auth guard redirects an unauthenticated visitor to /en/login, and the dev server compiled with no errors. What was NOT verified: any rendering with data, the filters, the thread, or either form's round trip.
