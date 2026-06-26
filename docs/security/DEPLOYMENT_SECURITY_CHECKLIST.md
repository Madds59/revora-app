# Deployment Security Checklist

Run before every production deploy (Vercel project serving `revora-app.vercel.app`,
backed by Supabase project `yqscayjvvnpsvocqrrot`).

## Pre-Deploy

- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm test` all green (from
      `apps/web`)
- [ ] `git diff --check` clean (repo root)
- [ ] Secret-pattern grep returns no hits (see
      [SECRETS_AND_ENVIRONMENT_POLICY.md](SECRETS_AND_ENVIRONMENT_POLICY.md) §3)
- [ ] If this release touches a high-risk area (auth/RLS/payments/documents/AI/
      notifications/platform admin), the relevant section of
      [SECURITY_RELEASE_GATE.md](SECURITY_RELEASE_GATE.md) has been completed
- [ ] If this release includes a new migration: confirmed additive-only, RLS
      enabled in the same migration for any new table, not numbered `0028`, and
      no historical migration file was edited
- [ ] If this release changes Stripe webhook code: confirmed review-only per
      program ground rules unless a documented finding justifies a behavior
      change
- [ ] If this release touches notification gating: confirmed
      `NOTIFICATIONS_DISPATCH_ENABLED`/`NOTIFICATIONS_LIVE_SEND_ENABLED` intent is
      unchanged (still off) unless this is a deliberate, operator-approved
      go-live

## Deploy

- [ ] Deploy via the normal Vercel pipeline (git push / Vercel CLI) — no manual
      hotfix-in-production edits
- [ ] If a new environment variable was added, it is set in Vercel for the
      correct environment (Production vs Preview) **before** the deploy that
      depends on it goes live, to avoid a runtime crash or, worse, a silent
      fallback to an insecure default
- [ ] If a new migration must run against the production Supabase project, it is
      applied as its own explicit, reviewed step — not assumed to auto-apply

## Post-Deploy

- [ ] `APP_URL=https://revora-app.vercel.app pnpm smoke:routes` run and reviewed
      (from `apps/web`)
- [ ] Spot-check Sentry for a new error spike immediately after deploy
- [ ] Spot-check that protected routes still redirect unauthenticated users (quick
      manual check of `/`, `/admin`, `/portal` while logged out)
- [ ] If this was a high-risk-area release, perform the relevant manual QA script
      from [SECURITY_QA_TEST_PLAN.md](SECURITY_QA_TEST_PLAN.md)

## Preview Deployments

- [ ] Confirm preview deployments do not have `NOTIFICATIONS_DISPATCH_ENABLED=true`
      or `NOTIFICATIONS_LIVE_SEND_ENABLED=true` pointed at real provider
      credentials
- [ ] Confirm preview deployments' Supabase target is understood (production
      project vs. a separate one) — if previews share the production database,
      treat preview URLs as production-sensitive and avoid posting them in public
      channels
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` and other server-only secrets are not
      accidentally exposed via a debug/preview-only code path

## Rollback Trigger Conditions

Roll back immediately (see
[DEVSECOPS_SECURITY_RUNBOOK.md](DEVSECOPS_SECURITY_RUNBOOK.md) §7) if, after
deploy, any of the following appear:

- A spike in 500 errors tied to a database/RLS error
- Any report or log evidence of cross-tenant data appearing in a response
- A spike in Stripe webhook signature failures (could indicate a misconfigured
  secret post-deploy, not necessarily an attack — but verify either way)
- Unexpected notification "sent" status in logs when live-send should be disabled
