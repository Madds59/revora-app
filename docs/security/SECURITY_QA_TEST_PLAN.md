# Security QA Test Plan

Owner: QA/Security Tester. Test runner: Node's built-in `node:test`, invoked via
`pnpm test` (`node --test tests/*.test.mjs`) from `apps/web`. No local Supabase
stack is available on the machine this audit ran from (no Docker — see project
README), so any test requiring a live Postgres/RLS connection is **out of
automated reach today** and is covered by a manual QA script instead.

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
2. **A representative sample of the files fixed for APPSEC-07 no longer contains
   the raw `error: error.message` / `error?.message ??` leak pattern** —
   regression guard so a future edit can't silently reintroduce raw DB error
   leakage. Covers server actions and `lib/` service functions across the
   action/mutation layer (see [APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md)
   APPSEC-07 for the full file list, which grew from 14 to 22 files once a
   full-tree grep was run during the fix — a reminder that this kind of
   pattern-based regression test is more reliable than trusting a single
   directory-scoped search).
3. **`platform_admins` self-elevation safeguards remain present** in
   `0009_platform_admins.sql` (the `is_super_admin()` guard and the
   self-removal block in `admin_set_super_admin()`).

See [APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md) for the findings these
tests guard against.

## 3. Why Live-RLS Tests Are Not Added in This Pass

A true multi-tenant RLS test (spin up two business accounts, two customer
accounts, and assert cross-access is denied) requires a running Supabase instance
with migrations applied — `scripts/e2e.mjs` already does exactly this against
`127.0.0.1:54321`, but it requires the local Supabase stack (Docker), which this
machine does not have installed (confirmed: no Docker; see project README's
prerequisites section). Adding a `node:test` file that assumes a live local
Supabase instance would fail in any environment without Docker and would violate
the "no brittle tests requiring real credentials" rule for this audit. **Manual QA
scripts are provided instead** (see §4) and `scripts/e2e.mjs` remains the
authoritative automated cross-tenant check for environments that do have the local
stack running.

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
