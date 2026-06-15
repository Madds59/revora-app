# Production Acceptance Record

Operator-facing acceptance record for Revora. It consolidates the automated
validation, direct live checks, browser QA expectations, and environment
readiness that gate a production release. It does not replace the detailed docs
it points to; it ties them together for a single acceptance pass.

Related docs: [VALIDATION.md](./VALIDATION.md),
[QA_CHECKLIST.md](./QA_CHECKLIST.md), [BROWSER_QA.md](./BROWSER_QA.md),
[VEHICLE_INTELLIGENCE.md](./VEHICLE_INTELLIGENCE.md),
[SUPER_ADMIN_BOOTSTRAP.md](./SUPER_ADMIN_BOOTSTRAP.md),
[STRIPE_WEBHOOK_READINESS.md](./STRIPE_WEBHOOK_READINESS.md).

## Production baseline

- Production branch: `main`
- Production commit at last acceptance: `3e8fed3` (Merge branch
  `vehicle-intelligence-post-release-hardening`)
- Live URL: https://revora-app.vercel.app
- `origin/main` is aligned with the live deployment.

## Automated validation

Run from `apps/web`. Do not run `build` and `typecheck` in parallel.

```bash
pnpm lint
pnpm build
pnpm typecheck
pnpm test
APP_URL=https://revora-app.vercel.app pnpm smoke:routes
```

Last acceptance run (2026-06-15):

| Step | Result |
| --- | --- |
| `pnpm lint` | pass |
| `pnpm build` | pass |
| `pnpm typecheck` | pass |
| `pnpm test` | 14/14 pass (incl. stop-driving, dangerous-step removal, post-AI safety override, missing-OpenAI-key fallback, invalid-JSON fallback, VIN-outage fallback) |
| `pnpm smoke:routes` | exit 0 — local DB E2E 14/14 (incl. RLS isolation + approvals RLS), live route smoke all pass, webhook checks pass |

### Smoke exit-code contract

- `0` — success.
- `1` — real application/auth regression. Investigate.
- `2` — environment/sandbox blocked (local Supabase on `127.0.0.1:54321`
  unreachable, or live fetches blocked from the sandbox). This is **not** an app
  regression. When smoke exits `2`, confirm the direct live checks below instead.

## Direct live verification

These confirm production routing and the Stripe webhook independently of the
smoke harness. Last acceptance run (2026-06-15) — all as expected:

| Check | Expected | Observed |
| --- | --- | --- |
| `GET /` | 307 → `/en` | 307 → `/en` |
| `GET /login` | 307 → `/en/login` | 307 → `/en/login` |
| `GET /signup` | 307 → `/en/signup` | 307 → `/en/signup` |
| `GET /en/ai/vehicle-diagnosis` (logged out) | 307 → `/en/login` | 307 → `/en/login` |
| `GET /en/ai/vin-decoder` (logged out) | 307 → `/en/login` | 307 → `/en/login` |
| `GET /en/ai/dtc-decoder` (logged out) | 307 → `/en/login` | 307 → `/en/login` |
| `GET /en/portal/vehicles` (logged out) | 307 → `/en/login` | 307 → `/en/login` |
| `GET /en/portal/ai/health-check` (logged out) | 307 → `/en/login` | 307 → `/en/login` |
| `POST /api/stripe/webhook` (unsigned) | 400/401, no redirect | 400 `{"error":"Invalid Stripe signature."}` |

There must be no Vercel SSO/auth wall in front of the app routes.

## Browser / operator QA

There is **no Playwright/Cypress/Puppeteer tooling in this repo**, so live
browser QA cannot be automated here. It is operator-run in a real authenticated
session. Use [BROWSER_QA.md](./BROWSER_QA.md) and [QA_CHECKLIST.md](./QA_CHECKLIST.md);
the Vehicle Intelligence acceptance items are below.

Run signed in, in `/en` and `/ar`:

- [ ] Logged-out users are redirected to login on every protected route.
- [ ] Business/staff user can open `/ai`, `/ai/vin-decoder`, `/ai/dtc-decoder`,
      `/ai/vehicle-diagnosis`.
- [ ] Customer user cannot reach business AI tools; portal health check is scoped
      to the customer's own linked vehicle/records.
- [ ] Invalid VIN fails safely (no invented specifications).
- [ ] VIN decoding uses the public NHTSA decoder and needs no VIN API key; a
      provider outage shows a safe `unavailable` state.
- [ ] With no `OPENAI_API_KEY`, diagnostics fall back to the rule-based engine
      and stay advisory (no crash).
- [ ] Dangerous symptoms trigger a stop-driving warning. Spot-check: brakes not
      working, steering failure, engine overheating, smell of fuel, airbag
      warning.
- [ ] Customer self-check steps stay low-risk; advisor summary and quote-draft
      controls are business/advisor-only.
- [ ] Arabic RTL layout is readable; the language switcher preserves route
      context; no raw translation keys are visible.
- [ ] No client console errors on main flows; no secrets or private data in URLs
      or page source. Stripe webhook behavior unchanged.

## Environment readiness (names only — never paste values)

AI / Vehicle Intelligence:

- `OPENAI_API_KEY` — optional. Present → active AI assistance. Absent → safe
  rule-based fallback (verified in `src/lib/vehicle-intelligence/openai.js` and
  the test suite).
- `OPENAI_MODEL` — optional. Defaults to `gpt-4.1-mini`.
- VIN decoding uses the public NHTSA decoder; **no VIN API key is required** in
  this release.

Verify production presence in the Vercel Dashboard (the Vercel CLI was not
available in the acceptance sandbox):

1. Open the Vercel Dashboard and select the Revora project.
2. Settings → Environment Variables.
3. Confirm Production has `OPENAI_API_KEY` if active AI assistance is expected.
4. Confirm `OPENAI_MODEL` only if a non-default model is desired.
5. Confirm no VIN API key is required for this release.
6. Redeploy production after adding or changing any env var.

Never print env values, never run `vercel env pull`, never commit `.env` files.

## Stripe price env readiness (names only)

Required env names:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER_MONTHLY`
- `STRIPE_PRICE_STARTER_YEARLY`
- `STRIPE_PRICE_PROFESSIONAL_MONTHLY`
- `STRIPE_PRICE_PROFESSIONAL_YEARLY`
- `STRIPE_PRICE_BUSINESS_MONTHLY`
- `STRIPE_PRICE_BUSINESS_YEARLY`
- `STRIPE_PRICE_ENTERPRISE_MONTHLY`
- `STRIPE_PRICE_ENTERPRISE_YEARLY`

`pnpm diagnose:billing` reports presence by name only (no values). In the
acceptance sandbox (2026-06-15) all eight `STRIPE_PRICE_*` names and
`STRIPE_SECRET_KEY` were **missing locally** — expected for a non-billing
sandbox. Billing readiness must be confirmed in Vercel Production:

1. Vercel Dashboard → Revora → Settings → Environment Variables.
2. Confirm all required names above exist for Production.
3. Price IDs come from real Stripe products and start with `price_`. Do not
   invent IDs.
4. Run a billing price sync only with explicit approval and a verified dry-run.

## Super-admin bootstrap

Operator-run and operator-pending. Full procedure in
[SUPER_ADMIN_BOOTSTRAP.md](./SUPER_ADMIN_BOOTSTRAP.md). Key invariants:

- Super admin is never selectable at signup and is never derived from
  `account_intent`.
- A super admin is a normal Supabase Auth user plus a row in
  `public.platform_admins`. The user signs up and sets their own password first.
- The operator runs `apps/web/scripts/grant-super-admin.mjs` locally with the
  production `SUPABASE_SERVICE_ROLE_KEY`. The key is never committed or pasted
  into docs.
- No smoke-test account (e.g. `owner@vrf.test`) is ever a production admin.

## Architecture invariants (must remain true)

- Tenant boundaries hold: business owner, staff/service advisor, customer portal,
  and super-admin surfaces stay separated; every Vehicle Intelligence row is
  `business_id`-scoped under RLS.
- `account_intent` is onboarding/routing metadata only and is never an
  authorization source (authorization is role-based via `lib/permissions`).
- Vehicle Intelligence is advisory only; safety overrides are enforced
  server-side regardless of AI output.
- `/api/stripe/webhook` stays public at the routing layer and verifies
  signatures before processing.

## Remaining operator-dependent items

1. Live authenticated browser QA (no automation tooling in repo).
2. Confirm `OPENAI_API_KEY` presence in Vercel Production (if active AI desired).
3. Confirm the eight `STRIPE_PRICE_*` names and `STRIPE_SECRET_KEY` /
   `STRIPE_WEBHOOK_SECRET` in Vercel Production.
4. Complete production super-admin promotion for the intended admin accounts.
