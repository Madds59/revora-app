# CI Validation Workflow

Owner: DevSecOps Owner. Implements DEVSECOPS-03 (and folds in DEVSECOPS-02) from
[SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md): the release-gate validation
commands, previously run by hand, now run automatically in GitHub Actions.

Workflow file: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

## Triggers

- `pull_request` targeting `main`
- `push` to `main`
- `workflow_dispatch` (manual)

## Jobs

### `validate` — runs on PR, push to main, and manual dispatch

| Step | Command | Purpose |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` (in `apps/web`) | Reproducible deps; fails if lockfile drifted |
| Lint | `pnpm lint` | ESLint |
| Build | `pnpm build` | `next build` compiles all routes |
| Typecheck | `pnpm typecheck` | `next typegen` + `tsc --noEmit` |
| Test | `pnpm test` | `node --test tests/*.test.mjs` (incl. the APPSEC-02/07/07b security regression tests) |
| Whitespace check | `git diff --check <base> HEAD` | No conflict markers / whitespace errors in the change |
| Secret scan | diff-scoped grep (see below) | No key-like values in added lines |

### `smoke` — runs on push to main + manual dispatch only (not PRs)

Runs `APP_URL=https://revora-app.vercel.app pnpm smoke:routes`: read-only GETs to
public production routes plus one POST the Stripe webhook must **reject** (no
signature). No secrets, no mutation, no email/SMS.

It is intentionally **not** on `pull_request` so PR validation does not depend on
production uptime. It is gated with `if: github.event_name != 'pull_request'`.

## Environment (no secrets)

The workflow needs **no GitHub secrets**. Two inline, non-secret placeholders are
set so `next build` passes the `required()` env checks in `apps/web/src/lib/env.ts`:

```yaml
NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY: ci-placeholder-anon-not-a-real-key
```

These are dummies — not real keys, not production, never GitHub secrets. The build
and tests do not connect to Supabase (verified locally: `next build` exits 0 with
these placeholders and all optional secrets absent). Notification flags are pinned
`false` as belt-and-suspenders.

## Smoke exit-code handling (why exit 2 is tolerated)

`apps/web/scripts/e2e.mjs` exits: **0** all good · **1** real failure · **2**
environment-blocked. Its local-DB portion targets `127.0.0.1:54321`, which does not
exist in CI, so that portion is reported **blocked** (exit 2) while the production
route smoke still runs. The workflow therefore fails only on exit **1** (a real
route/webhook regression) and treats exit **2** as expected-in-CI. Standing up a
local Supabase stack in CI (via the Supabase CLI + local demo keys) is a possible
future enhancement to make the full smoke run, but is deliberately out of scope for
this minimal, secret-free workflow.

## Secret-scan strategy and limitations

The scan greps **added lines only** in the PR/push diff for key-like values:

```
OPENAI_API_KEY= | VIN_API_KEY= | SUPABASE_SERVICE_ROLE_KEY= | sb_secret_ |
STRIPE_SECRET_KEY= | STRIPE_WEBHOOK_SECRET= | whsec_ | sk_live_ | sk_test_ | eyJ
```

Design choices (matching the security program's guidance that **variable names in
prose are not secrets**):

- Assignment patterns use `=` (e.g. `STRIPE_SECRET_KEY=`) so documentation that
  merely *names* a variable does not trip the scan. Unanchored tokens
  (`sb_secret_`, `whsec_`, `sk_live_`, `sk_test_`, `eyJ`) are actual secret
  prefixes/shapes unlikely to appear except as real values.
- **Excluded paths:** the pnpm lockfile (integrity hashes), `.github/**` (this
  workflow file legitimately contains the pattern strings — scanning it would
  self-match), and `docs/**` (the security docs intentionally reference secret
  variable names as prose).
- On a hit, CI **does not print the matching content** (only a count) — it tells
  the developer to review locally. This avoids echoing a secret into build logs.

Limitation: because `docs/**` and `.github/**` are excluded, a real secret pasted
into a doc or workflow would not be caught by CI — those files are covered by human
PR review instead. The highest-risk surface (app source / config) is scanned.

## Hardening choices

- `permissions: contents: read` (least privilege).
- `concurrency` cancels superseded runs on the same ref.
- `fetch-depth: 0` on the validate checkout so diff-based checks have the base.
- pnpm pinned `11.6.0`, Node pinned `24` (matches the locally-verified toolchain);
  pnpm store cached via `actions/setup-node` `cache: pnpm`.

## Running the same checks locally

```bash
cd apps/web
pnpm lint && pnpm build && pnpm typecheck && pnpm test
APP_URL=https://revora-app.vercel.app pnpm smoke:routes   # exit 2 = local-DB blocked, fine
# from repo root:
git diff --check
git diff -- . ':!apps/web/pnpm-lock.yaml' | grep -Ei 'sk_live_|sk_test_|whsec_|sb_secret_|eyJ' || echo clean
```

## Status of first run

The workflow's first *actual* GitHub Actions run occurs when this branch is pushed
/ its PR is opened. Every command it runs has been validated locally under a
CI-equivalent environment (placeholder env, no real secrets); the YAML has been
syntax-checked. See [SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md)
DEVSECOPS-03.
