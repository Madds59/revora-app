# Security QA Test Plan

Owner: QA/Security Tester. Test runner: Node's built-in `node:test`, invoked via
`pnpm test` (`node --test tests/*.test.mjs`) from `apps/web`. A local Supabase
stack was confirmed reachable at `127.0.0.1:54321` during Phase 10 validation of
the original pass (`scripts/e2e.mjs` successfully signed up a real test user and
ran 14 live RLS checks) — this superseded an earlier, incorrect assumption that
Docker wasn't installed on this machine. `pnpm test` itself still runs fully
offline (see §5); the live-RLS coverage lives in `scripts/e2e.mjs`, run via
`pnpm smoke:routes`, not in the `node:test` suite.

## 1. What's Already Automated (found in `apps/web/tests/` before this pass)

| File | Covers |
|---|---|
| `auth-links.test.mjs` | Locale-aware auth route path building (login/signup/forgot-password/reset-password) |
| `notifications.test.mjs` | Template rendering, UUID redaction, no-op provider resolution without env config, three-layer live-send gating, migration structure (dedupe/queue-claim SQL) |
| `vehicle-intelligence.test.mjs` | VIN validation, critical-symptom safety classification, dangerous self-check step removal, DTC interpretation, diagnostic JSON schema validation, search helpers |
| `billing-summary.test.mjs`, `ratings.test.mjs`, `retainer-calculator.test.mjs`, `membership-bundles.test.mjs`, `launch-ops.test.mjs`, `locale-path.test.mjs` | Domain logic for their respective features (not security-focused, but contribute to overall correctness) |

This is solid coverage for **pure-function logic** (template rendering, safety
classification, gating logic). It does not, and cannot without a live database,
exercise **RLS enforcement itself** — that requires an actual Postgres connection
with the policies applied.

## 2. New Automated Coverage Added in This Pass

`apps/web/tests/security-regressions.test.mjs` (added alongside the Phase 9 fix) —
static, text-based regression guards requiring no live services, no secrets, and
no network calls, following the same pattern `notifications.test.mjs` already uses
for asserting on migration SQL text:

1. **`account_intent` never appears in any RLS-policy-bearing migration** —
   guards the program's single most important non-negotiable (APPSEC-02): that
   onboarding metadata is never promoted into an authorization check at the
   database layer.
2. **All 21 of the fully-cleaned files fixed for APPSEC-07 no longer contain the
   raw `error: error.message` / `error?.message ??` leak pattern** — regression
   guard so a future edit can't silently reintroduce raw DB error leakage. Covers
   server actions and `lib/` service functions across the action/mutation layer
   (see [APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md) APPSEC-07 for the full
   22-file list — 21 are covered by this exact-match test; `onboarding/actions.ts`
   is excluded because it has one deliberately-kept Supabase Auth SDK message).
3. **No `page.tsx` anywhere under `app/` renders a raw query error in JSX**
   (APPSEC-07b) — unlike the APPSEC-07 test above, this is a tree-wide,
   pattern-based scan (not a closed file list), so it also catches the same
   mistake in any future page, not just the 20 files fixed in the APPSEC-07b
   pass. Checks for `{xError.message}`-style JSX, `String(error)`/
   `JSON.stringify(error)` stringification, and `${error}` template-literal
   interpolation, with `(auth)/**` excluded (documented Auth SDK exception, see
   APPSEC-08). Verified to actually catch the bug: a leak was temporarily
   reintroduced into one file during development of this test, confirmed the
   test failed, then reverted.
4. **`platform_admins` self-elevation safeguards remain present** in
   `0009_platform_admins.sql` (the `is_super_admin()` guard and the
   self-removal block in `admin_set_super_admin()`).

See [APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md) for the findings these
tests guard against.

## 3. Why Live-RLS Tests Are Not Added in This Pass

A true multi-tenant RLS test (spin up two business accounts, two customer
accounts, and assert cross-access is denied) requires a running Supabase instance
with migrations applied — `scripts/e2e.mjs` already does exactly this against
`127.0.0.1:54321`, and was confirmed working during this program's validation
passes. It is still not folded into `apps/web/tests/*.test.mjs` / `pnpm test`,
because that suite is expected to run offline in any environment (including CI,
once DEVSECOPS-03 is addressed) — making `pnpm test` depend on a live local
Supabase stack would make it fail in any environment without one, which violates
the "no brittle tests requiring real credentials" rule for this audit. **Manual QA
scripts are provided as the documented alternative** (see §4), and `scripts/e2e.mjs`
(invoked via `pnpm smoke:routes`) remains the authoritative automated cross-tenant
check for environments that do have the local stack running.

## 4. Manual QA Scripts (for anyone with a runnable environment — local Docker
stack or a disposable hosted Supabase project)

- [MULTI_TENANT_TEST_MATRIX.md](MULTI_TENANT_TEST_MATRIX.md) — Business A vs.
  Business B, Customer A vs. Customer B cross-access attempts.
- [ACCOUNT_SAFETY_TEST_MATRIX.md](ACCOUNT_SAFETY_TEST_MATRIX.md) — login, session
  expiry, password reset, invite reuse, role-boundary attempts.
- [NOTIFICATION_SAFETY_TEST_MATRIX.md](NOTIFICATION_SAFETY_TEST_MATRIX.md) —
  dispatcher no-op verification, opt-out, label/redaction checks.
- [AI_SAFETY_TEST_MATRIX.md](AI_SAFETY_TEST_MATRIX.md) — diagnostic guardrails,
  VIN grounding, tenant scoping.

## 5. Running the Suite

```
cd apps/web
pnpm test
```

All tests in this plan run offline, with no real credentials, no live provider
calls, and no database connection (except `scripts/e2e.mjs`, which is a separate
script, not part of `pnpm test`, and is only meaningful against a local Supabase
stack).

## 6. Rules Followed

Per program ground rules: no test added in this pass requires production secrets,
makes a real provider call, sends a notification, or mutates production data. All
new assertions are against source/migration text or pure in-memory functions.
