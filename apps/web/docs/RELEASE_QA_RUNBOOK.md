# Revora Release QA Runbook

## Purpose And Scope

This runbook defines the minimum release discipline for Revora web releases. It applies to production, preview, hotfix, and migration-backed feature branches for the Next.js web app under `apps/web`.

The goal is to prevent regressions in authentication, tenant isolation, locale routing, billing, Stripe webhook handling, Supabase RLS, and customer-facing portal flows while keeping releases small and reviewable.

## Release Gates

Every release branch must pass these gates before merge:

- Branch is focused on one release objective.
- Working tree is clean except intended files.
- No unrelated files are staged.
- No `.env` files are staged.
- No secrets appear in diffs, logs, docs, or screenshots.
- No runtime collision with active branches owned by another agent.
- No migration collision with already assigned migration numbers.
- Authenticated QA is complete or explicitly marked blocked.
- Browser QA is complete for user-facing UI changes.
- Unsigned Stripe webhook request rejects without middleware redirect.

## Required Validation Commands

Run from the web app root:

```bash
cd ~/Downloads/Revora-app/apps/web

pnpm lint
pnpm build
pnpm typecheck
pnpm test
APP_URL=https://revora-app.vercel.app pnpm smoke:routes
```

Do not run `pnpm build` and `pnpm typecheck` in parallel because `.next/types` can race.

## Smoke Route Expectations

Smoke route checks must confirm:

- `/` redirects to `/en`.
- `/login` redirects to `/en/login`.
- `/signup` redirects to `/en/signup`.
- Canonical customer portal routes live under `/<locale>/portal`.
- Business routes live under the existing `/<locale>` dashboard structure.
- API routes are not locale-prefixed.
- `/api/stripe/webhook` remains outside auth middleware and rejects unsigned requests with `400`.
- No duplicate locale paths such as `/en/en/...`.
- EN and AR public, auth, dashboard, admin, portal, and tool routes resolve according to the smoke route manifest.

## Secret Scan

Run from the project root:

```bash
cd ~/Downloads/Revora-app

git diff --check

git diff -- . ':!pnpm-lock.yaml' | grep -Ei "OPENAI_API_KEY=|VIN_API_KEY=|SUPABASE_SERVICE_ROLE_KEY|sb_secret_|STRIPE_SECRET_KEY=|STRIPE_WEBHOOK_SECRET=|whsec_|sk_live_|sk_test_|service_role|eyJ" || true
```

Any match must be treated as a stop condition until reviewed. Do not paste keys into chat, docs, screenshots, or commits.

## Collision Scan

Before staging, compare the branch against `origin/main`:

```bash
git diff --name-only origin/main...HEAD
```

Confirm changed files belong to the branch scope. If another agent owns a touched file, stop and coordinate before editing or staging it.

High-risk collision zones:

- Auth, middleware, route protection, and account routing.
- Billing, Stripe, webhook, and subscription logic.
- Supabase database types and migrations.
- Shared display labels, locale messages, and navigation.
- Launch Ops runtime files.
- Active hotfix files owned by another agent.

## Migration Scan

For any branch that includes a migration:

- Confirm the migration number is next available and not reserved.
- Confirm it is additive unless a separate destructive migration approval exists.
- Confirm RLS is preserved or strengthened.
- Confirm SQL can be reviewed without reading `.env` files.
- Confirm database types are regenerated only after reviewed schema changes.
- Confirm post-migration browser QA is planned.

Current governance notes:

- `0028` is intentionally skipped / historical slot.
- `0029` is Launch Ops Foundation.
- F5 must use `0030` or the next available migration if schema is required.

## Browser QA Gate

Browser QA is required when a branch changes user-visible behavior, routing, forms, navigation, auth shells, billing pages, portal pages, admin pages, dashboards, or localized strings.

Browser QA should verify:

- Desktop and mobile viewports.
- LTR and RTL behavior where EN/AR surfaces are affected.
- Signed-out routing.
- Signed-in owner/staff routing.
- Signed-in customer portal routing.
- Form validation and success/error states.
- No visible raw UUID labels in customer-facing or operator-facing UI unless intentionally diagnostic.

## Authenticated QA Requirements

Authenticated QA requires operator-owned credentials. Agents must not create, request, print, store, or handle passwords.

Required sessions:

- Business owner or authorized staff session.
- Linked customer portal session.
- Optional second customer session for RLS isolation checks.

If authenticated QA cannot be completed, mark it `BLOCKED`, state why, and do not claim full release confidence.

## Preview Deployment Expectations

Before production merge, preview deployment should be checked for:

- Correct build commit.
- Correct branch.
- Expected environment variables configured by the operator.
- Auth routes functional on the preview domain.
- Preview login requirements understood. A production session may not carry to a preview domain.
- No CORS, redirect, cookie, or callback URL regressions.

## Production Post-Deploy Checks

After production deployment:

- Confirm production URL responds: `https://revora-app.vercel.app`.
- Run smoke routes against production.
- Check login and signup redirects.
- Confirm unsigned Stripe webhook rejects with `400` and does not redirect.
- Check the changed feature manually.
- Check Sentry/PostHog if the release touches monitored flows.
- Confirm no unexpected Supabase errors appear during QA.

## Merge Approval Rules

Do not merge if:

- Lint, build, typecheck, test, or smoke fail because of app logic.
- Secret scan has unresolved matches.
- Runtime collision is unresolved.
- Migration collision is unresolved.
- Auth/RLS weakening is present without explicit review.
- Stripe webhook protection is changed without explicit review.
- Authenticated QA is required and neither completed nor clearly blocked.

## Rollback And Mitigation Notes

Prepare a rollback note for every release:

- Commit or branch to revert.
- User-visible symptoms.
- Data-risk assessment.
- Whether a database migration was applied.
- Whether rollback requires a forward-fix instead of Git revert.
- Support message for affected pilot users.

Migration-backed releases may require mitigation rather than rollback. Never run destructive Supabase commands against production.
