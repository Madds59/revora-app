# API Security Checklist

Applies to every route under `apps/web/src/app/api/**` and every Server Action
under `apps/web/src/app/[locale]/**/actions.ts`. Use this when adding a new one;
use [SECURITY_RELEASE_GATE.md](SECURITY_RELEASE_GATE.md) for the release-level gate.

## Current Inventory (as of this audit)

| Route/Action group | Auth model | Notes |
|---|---|---|
| `app/api/stripe/webhook/route.ts` | Stripe signature (raw body, `timingSafeEqual`) | No session auth — server-to-server; see APPSEC-14 |
| `app/api/notifications/dispatch/route.ts` | Shared secret header (`x-notification-dispatch-secret`) + env flag | No session auth — intended for a trusted scheduler/operator, not end users; see APPSEC-12 |
| `app/api/launch-ops/templates/[template]/route.ts` | None (public) | Serves a static CSV schema template — intentionally public, no tenant data |
| `(dashboard)/**/actions.ts` (quotations, jobs, customers, vehicles, complaints, settings, notifications, billing, admin) | Session via `requireMembership()` / `requireSuperAdmin()`, `business_id` derived server-side | See APPSEC-03 |
| `(portal)/portal/actions.ts` | Session via `requireCustomerPortal()`, ownership re-checked against caller's own `accounts` list | See APPSEC-03, APPSEC-16 |
| `(auth)/actions.ts` | Supabase Auth SDK directly (no prior session) | See APPSEC-01, APPSEC-08 |
| `(onboarding)/onboarding/actions.ts` | Session via `requireUser()`, creates the first business/membership | — |

## Checklist for a New Route or Server Action

- [ ] **Identity**: Does it call `requireUser()`/`requireMembership()`/
      `requireCustomerPortal()`/`requireSuperAdmin()` (or the route-handler
      equivalent: signature/secret check) before touching any data?
- [ ] **Tenant scope**: Is `business_id` (or customer ownership) derived from the
      authenticated session/membership, never read directly from the request body,
      query string, or a hidden form field, and used as-is?
- [ ] **RLS backstop**: Does every table this code touches have an RLS policy that
      would independently reject a cross-tenant request even if the application
      check were buggy? (Check [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md).)
- [ ] **Input validation**: Are inputs checked for type/shape before use? (Today
      this is inconsistent — see APPSEC-09 — but new code should prefer explicit
      validation over trusting `FormData` shape.)
- [ ] **Error handling**: On failure, does the caller see a short, safe, generic
      message while the real error (including any Postgres/PostgREST detail) is
      only logged server-side (`console.error` or equivalent)? Never return
      `error.message` from a database call directly to the client (see APPSEC-07).
- [ ] **Role check**: If the action is restricted to a subset of roles (e.g.
      manager+ only), is that enforced both in the RLS policy *and* in the app
      code (e.g. `canManageQuotes(role)`), not just hidden in the UI?
- [ ] **Secrets**: Does the route avoid logging or echoing back any secret/token
      value, including in error paths?
- [ ] **Idempotency** (for anything payment- or webhook-adjacent): Is replay
      handled (unique constraint + upsert, or equivalent)?
- [ ] **Rate/abuse considerations**: For anything that could be hit at volume
      (invites, password reset, notification dispatch), is there a reasonable
      built-in limiter (e.g. the existing pending-invite-uniqueness constraint)?
      The **auth** actions in `(auth)/actions.ts` are covered by the shared
      Postgres limiter (`enforceAuthRateLimit`, see the gaps section below);
      nothing else is. Treat new public-facing endpoints outside that set as
      higher risk until platform-wide coverage exists.
- [ ] **Public vs protected**: If the route is intentionally public (like the
      launch-ops template downloads), confirm it truly carries no tenant data and
      say so in a comment or this checklist's inventory table above.

## Known Platform-Wide Gaps (tracked, not blocking)

- Rate limiting now covers the **auth** actions, and only those. APPSEC-10
  Task 4/5 added a Postgres-backed limiter: the `SECURITY DEFINER` function
  `public.consume_rate_limit(scope, identifier)`
  (`supabase/migrations/0031_auth_rate_limits.sql`), reached from
  `apps/web/src/lib/rate-limit.ts` through the **service-role** client only —
  `EXECUTE` is revoked from `public`, `anon` and `authenticated`, because an
  anon-callable limiter is itself an account-lockout weapon. It **fails
  closed**: any RPC, client-construction or network failure denies the attempt
  rather than silently disabling the limiter. Six hard-coded scopes, with limits
  and windows living inside the function (never in the caller): `login_ip`
  (20/15 min), `login_email` (8/15 min), `password_reset_ip` (10/h),
  `password_reset_email` (5/h), `signup_ip` (10/h), `magic_link_email` (5/h).
  Identifiers are hashed before storage, so raw emails and IPs never land in the
  table. Sign-in, magic link and password reset are **dual-keyed** (IP bucket
  *and* identifier bucket) so that neither an identifier-only lockout nor an
  IP-rotating attacker defeats it; signup is IP-only by design.
  **Remaining gap**, narrowed: non-auth surfaces are still unlimited — invite
  acceptance, the notification dispatch route, AI-advisory and
  vehicle-intelligence calls, and file uploads. The `/login/mfa` code
  submission also has no bucket of its own; it falls back on GoTrue's own limit,
  which is *assumed* rather than established — nothing here configures it
  (`config.toml`'s `[auth.rate_limit]` block has no MFA-verify knob) and it has
  not been verified
  (see [AUTH_HARDENING.md](AUTH_HARDENING.md)). Extending coverage means adding
  scopes to the function's allowlist in a NEW migration, never by editing 0031
  in place — see [DEVSECOPS_SECURITY_RUNBOOK.md](DEVSECOPS_SECURITY_RUNBOOK.md).
- No centralized request schema validation library wired into every action (see
  APPSEC-09).
- No automated test asserts a 403/404 on cross-tenant API/action access today (see
  QA-01 in [SECURITY_RISK_REGISTER.md](SECURITY_RISK_REGISTER.md)); manual QA
  script provided in [MULTI_TENANT_TEST_MATRIX.md](MULTI_TENANT_TEST_MATRIX.md) as
  interim coverage.
