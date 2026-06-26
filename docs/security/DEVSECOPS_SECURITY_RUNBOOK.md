# DevSecOps Security Runbook

Owner: DevSecOps Owner. Covers Vercel, Supabase, secrets, CI/build, and operational
scripts as found in the repo on `origin/main` @
`a3d21f078ff1e253a7050502d2b473a25271d9aa`.

## 1. Current Pipeline Reality

- **No CI workflow exists** (`.github/workflows/` is absent). All validation
  (`pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm smoke:routes`,
  the secret-pattern grep) is run manually by whoever is shipping a change. This
  means the release gate in [SECURITY_RELEASE_GATE.md](SECURITY_RELEASE_GATE.md) is
  currently enforced by discipline, not tooling. **Tracked as DEVSECOPS-03 in
  [SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md).**
- Deployment is via Vercel, linked locally through `.vercel/` (gitignored —
  confirmed in `.gitignore`). No `vercel.json` is present, so Vercel uses framework
  defaults for the Next.js app.
- Local secrets live in `apps/web/.env.local`, which is gitignored
  (`.env` and `.env.*` patterns in `.gitignore`, with only `.env.example` excluded
  from the ignore — note `apps/web/.env.local.example` is the actual template
  referenced by the README; it should contain placeholder values only, never real
  ones).

## 2. Operational Scripts (security-relevant)

| Script | Purpose | Security properties observed |
|---|---|---|
| `scripts/grant-super-admin.mjs` | Bootstraps the *first* platform admin out-of-band | Uses `SUPABASE_SERVICE_ROLE_KEY` read from local `.env.local`/real env only, never deployed; explicitly documented as the safe path for first-admin bootstrap; all subsequent admin changes go through the in-app `SECURITY DEFINER` RPC |
| `scripts/diagnose-billing-env.mjs` | Confirms Stripe price env vars are configured and match Stripe | **Good practice observed**: never prints the service-role key or Stripe secret value — only prints "configured: yes/no" and public Stripe price IDs (`price_...`, not secret) |
| `scripts/sync-stripe-plan-prices.mjs` | Syncs Stripe price IDs into `billing_plans` | Not deeply reviewed in this pass; uses the same service-role/Stripe-secret pattern — re-review if it changes |
| `scripts/e2e.mjs` | Smoke-tests RLS-governed operations against a **local** Supabase stack (`127.0.0.1:54321`) using Supabase's well-known public local-dev demo anon key (not a secret — this is the standard key shipped with the Supabase CLI for local development) | Also supports a production route-availability smoke pass when `APP_URL` is set (see `e2e.mjs:273,390`) — this is what `APP_URL=https://revora-app.vercel.app pnpm smoke:routes` exercises |

## 3. Secret Handling Rules

1. Secrets are only ever read from `process.env` server-side; this audit's
   AppSec pass (see [APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md)) confirmed no
   non-`NEXT_PUBLIC_` secret-shaped variable is referenced from `"use client"` code.
2. Full inventory and rules: [SECRETS_AND_ENVIRONMENT_POLICY.md](SECRETS_AND_ENVIRONMENT_POLICY.md).
3. This audit did **not** read `.env`/`.env.local` files and did **not** print any
   secret value, per the program's ground rules — all environment variable names in
   this documentation set were derived from source-code references
   (`process.env.X`), never from actual secret files.
4. Never commit a real secret to git. If one is committed accidentally: rotate it
   immediately (DevSecOps Owner + a human with provider console access — this
   program does not automate rotation), then scrub history if feasible, then
   document the incident per
   [REVORA_SECURITY_PROGRAM.md](REVORA_SECURITY_PROGRAM.md) §7.

## 4. Production/Preview Environment Separation

- Vercel project `revora-app` serves production at `revora-app.vercel.app`; Vercel
  preview deployments are created per-branch/PR by default Vercel behavior.
- **Risk to verify operationally** (not confirmed in this code-only pass): that
  preview deployments either (a) point at a separate, non-production Supabase
  project, or (b) if they share the production Supabase project, that this is a
  deliberate accepted risk. Preview URLs are often less guarded (no custom domain,
  sometimes indexable) — if previews share the production database, a leaked
  preview URL is equivalent to a leaked production URL. **Recommend confirming
  Vercel environment-variable scoping (Production vs. Preview vs. Development)
  in the Vercel dashboard**, since that configuration lives outside this repo and
  could not be verified from code alone.
- `NOTIFICATIONS_DISPATCH_ENABLED` / `NOTIFICATIONS_LIVE_SEND_ENABLED` must be
  confirmed **off** in any preview environment that might share real customer data
  or real provider credentials, to avoid a preview deploy accidentally sending a
  real notification.

## 5. Supabase Service-Role Restrictions

- `SUPABASE_SERVICE_ROLE_KEY` is referenced only in server-only files
  (`lib/supabase/admin.ts`) and local CLI scripts — never in client code.
- The service role bypasses RLS entirely. Every code path using the admin client
  must be manually re-verified to apply its own authorization check (e.g.
  `is_super_admin()` inside the RPC, or an explicit ownership check in the calling
  code) since RLS will not save it.
- Recommend a periodic grep (`grep -rn "SUPABASE_SERVICE_ROLE_KEY\|createAdminClient\|service_role" apps/web/src`)
  as part of any future security pass to confirm the admin client's call sites
  haven't grown without a matching authorization review.

## 6. Vercel Deployment Safety

- Confirm build does not emit secrets into client bundles — Next.js only inlines
  `NEXT_PUBLIC_*` vars into the client bundle by design; this audit found no
  non-`NEXT_PUBLIC_` secret referenced from client code (see APPSEC review).
- Confirm Vercel's environment variables are scoped per-environment (Production
  vs Preview) in the dashboard, not all marked "all environments" by default,
  especially for `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`,
  `NOTIFICATIONS_DISPATCH_SECRET`, `OPENAI_API_KEY`, `RESEND_API_KEY`,
  `TWILIO_AUTH_TOKEN`.
- Rollback: use Vercel's built-in "promote a previous deployment" / instant
  rollback feature rather than a force-push or revert race under incident
  pressure — see §7.

## 7. Rollback Process

1. **App-only regression** (no migration involved): use Vercel's dashboard/CLI to
   instantly roll back to the last known-good deployment. This is the fastest safe
   path and does not require a git revert first.
2. **Regression involving a new migration**: do not simply roll back the app while
   leaving a half-applied schema change in place. Assess whether the migration is
   backward-compatible with the previous app version; if not, this becomes an
   incident requiring a forward-fix migration rather than a rollback (Revora's
   migrations are append-only/historical per program rules — "do not modify
   historical migrations").
3. Record the rollback in [SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md) if
   it was security-motivated.

## 8. Backup/Restore Expectations

See [BACKUP_AND_RECOVERY_PLAN.md](BACKUP_AND_RECOVERY_PLAN.md) for full detail —
summary: rely on Supabase's managed Postgres backups (point-in-time recovery
availability depends on the project's Supabase plan tier — verify in the Supabase
dashboard for project `yqscayjvvnpsvocqrrot`, not confirmable from code).

## 9. Monitoring Hooks

Sentry and PostHog are present in the stack per project docs. Full alerting plan:
[MONITORING_AND_ALERTING_PLAN.md](MONITORING_AND_ALERTING_PLAN.md). This pass did
not deeply audit instrumentation call sites for incidental personal-data capture —
flagged as follow-up in [PRIVACY_IMPACT_ASSESSMENT.md](PRIVACY_IMPACT_ASSESSMENT.md).

## 10. Incident Response Escalation

See [REVORA_SECURITY_PROGRAM.md](REVORA_SECURITY_PROGRAM.md) §7 for the full model.
DevSecOps Owner's specific responsibilities during an incident: contain (disable
feature flag / roll back deployment), assist credential rotation, pull relevant
Vercel/Supabase/Sentry logs for the AppSec Reviewer's root-cause analysis.
