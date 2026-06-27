# Secrets and Environment Policy

Owner: DevSecOps Owner. All variable names below were derived from source-code
references (`process.env.X`) found via grep — **no `.env` file was read and no
secret value is reproduced anywhere in this document**, per program ground rules.

## 1. Inventory (as referenced in `apps/web/src`)

### Public (safe to ship in the client bundle — `NEXT_PUBLIC_` prefix)

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (RLS-restricted by design — safe to expose) |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL for metadata/redirects |

### Server-only secrets (must never reach client code)

| Variable | Used for | Where |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS; admin operations, CLI scripts | `lib/supabase/admin.ts`, `scripts/grant-super-admin.mjs`, `scripts/diagnose-billing-env.mjs` |
| `STRIPE_SECRET_KEY` | Stripe API calls | `lib/env.ts`, billing actions, webhook handler |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification | `lib/stripe-webhook.ts` |
| `OPENAI_API_KEY` | AI Vehicle Intelligence advisory text | `lib/vehicle-intelligence/service.ts` |
| `OPENAI_MODEL` | Model selection (not secret, but co-located with the key) | same |
| `NOTIFICATIONS_DISPATCH_ENABLED` | Global kill-switch for the dispatch route | `app/api/notifications/dispatch/route.ts` |
| `NOTIFICATIONS_DISPATCH_SECRET` | Shared secret for the dispatch route | same |
| `NOTIFICATIONS_LIVE_SEND_ENABLED` | Global kill-switch for actually calling a provider | `lib/notifications/provider.js` |
| `NOTIFICATIONS_EMAIL_FROM` | From-address for outbound email | `lib/notifications/service.ts` |
| `RESEND_API_KEY` | Email provider credential | same |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | SMS provider credentials | same |
| `STRIPE_PRICE_<PLAN>_<CADENCE>` (e.g. `STRIPE_PRICE_STARTER_MONTHLY`) | Stripe price IDs (not secret values themselves, but config that should match Stripe dashboard) | `scripts/diagnose-billing-env.mjs`, `scripts/sync-stripe-plan-prices.mjs` |

This list reflects what the codebase references as of this audit. **Re-derive it
with `grep -rn "process.env\." apps/web/src` whenever this policy is revisited** —
do not assume it is exhaustive or that it stays accurate as the code evolves.

## 2. Rules

1. **No non-`NEXT_PUBLIC_` variable may be imported into a `"use client"` file**,
   or passed as a prop into one in a way that ends up in the client bundle. This
   was verified clean in this audit (see
   [APPSEC_REVIEW_REPORT.md](APPSEC_REVIEW_REPORT.md)) — re-verify after any change
   that moves logic between server and client components.
2. **`SUPABASE_SERVICE_ROLE_KEY` is the single highest-value secret in this
   system** — it bypasses every RLS policy. It must only be used: (a) server-side
   in `lib/supabase/admin.ts`-style code with its own explicit authorization check,
   or (b) in local operator CLI scripts run from a trusted machine, reading from
   `.env.local`, never deployed to Vercel's client-reachable surface.
3. **Dispatch/webhook secrets are bearer secrets** — anyone with
   `NOTIFICATIONS_DISPATCH_SECRET` or the ability to forge a Stripe signature (i.e.
   anyone with `STRIPE_WEBHOOK_SECRET`) can act as that trusted caller. Treat them
   with the same care as API keys.
4. **No secret is ever logged.** This audit's fix to error-message leakage
   (APPSEC-07) specifically logs the *error object* server-side, not any
   request/environment secret — reviewers of future logging changes should
   confirm logged objects don't accidentally include a secret-bearing header or
   env var.
5. **`.env.local` (and any `.env*` except `.env.example`) must never be
   committed.** This is already enforced by `.gitignore`; this audit confirmed no
   `.env` file is tracked or staged.
6. **Rotation is a human, out-of-band action.** This program does not automate key
   rotation. If a secret is suspected compromised, the DevSecOps Owner coordinates
   rotation directly in the provider's dashboard (Supabase, Stripe, Resend,
   Twilio, OpenAI) and updates Vercel's environment variables, then redeploys.
7. **Local diagnostic scripts must never print secret values** — only
   presence/absence or non-secret derived data (e.g. a Stripe price ID, which is
   not sensitive). `scripts/diagnose-billing-env.mjs` is a good example of this
   pattern to follow for any new diagnostic tooling.

## 3. Validation Command (secret-pattern scan)

Run from repo root before every commit/release (see
[SECURITY_RELEASE_GATE.md](SECURITY_RELEASE_GATE.md)):

```
git diff -- . ':!pnpm-lock.yaml' | grep -Ei "OPENAI_API_KEY=|VIN_API_KEY=|SUPABASE_SERVICE_ROLE_KEY|sb_secret_|STRIPE_SECRET_KEY=|STRIPE_WEBHOOK_SECRET=|whsec_|sk_live_|sk_test_|service_role|eyJ" || true
```

Note: literal PostgreSQL role names like `service_role` appearing in SQL `grant`
statements are expected and not secrets — the grep is intentionally broad to catch
accidental key pastes; a human still needs to interpret hits. **This is currently a
manual command, not a CI gate — see DEVSECOPS-03 in
[SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md).**

## 4. Recommended Future Hardening (not implemented in this pass)

- Wire the secret-pattern grep above into a CI step (e.g. GitHub Actions) so it
  runs on every PR, not just when a human remembers to run it locally.
- Consider a dedicated secret-scanning tool (e.g. gitleaks) for broader coverage
  than the current regex list.
- Confirm Vercel environment-variable scoping (Production/Preview/Development) for
  every secret in §1, in the Vercel dashboard — not verifiable from this repo.
