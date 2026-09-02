# APPSEC-10 — Authentication Hardening (MFA, Rate Limiting, Password Policy)

**Date:** 2026-08-21
**Branch:** `security/appsec-10-auth-hardening` (off `main` @ 67d25a2)
**Status:** Design approved for implementation

## Origin

A five-point security checklist was raised against the app. An audit of the
actual codebase found **two of the five already implemented** and three genuinely
missing. This spec covers only the three real gaps.

### Already implemented — no change required

| Claim | Finding |
|---|---|
| "Session token is in localStorage (XSS-exposed)" | **False for this codebase.** Sessions are cookie-based end to end via `@supabase/ssr`: `lib/supabase/server.ts` uses `createServerClient` over request cookies, and `lib/supabase/middleware.ts` refreshes with `getUser()` (which revalidates against the Auth server rather than trusting the local JWT). `grep -rn localStorage src` returns zero hits. The browser client is imported in exactly one place — `components/file-upload.tsx` — for direct-to-Storage uploads. |
| "Admin check is client-side" | **False.** `lib/auth.ts:isSuperAdmin()` queries the `platform_admins` table server-side; `requireSuperAdmin()` gates the entire `(admin)` route-group layout; every admin Server Action calls it again *and* delegates to a `SECURITY DEFINER` RPC that independently re-checks `is_super_admin()`. Three independent server-side layers. |

Both findings are recorded here so a future reader does not "re-fix" them.

### Real gaps — the scope of this spec

Two were already known to the security program and deferred:

- `docs/security/API_SECURITY_CHECKLIST.md:55` — *"No centralized rate-limiting
  middleware for sensitive routes (login, password…)"*, explicitly deferred as a
  future DevSecOps item.
- `docs/security/THREAT_MODEL.md:84` — admin-account compromise is *"mitigated
  only by admin account hygiene (MFA, credential strength) — outside this
  codebase's control."*

The third — password policy and breached-credential screening — appears nowhere
in the 31-document security program. `grep -riE "password polic|leaked password|pwned"`
over `docs/security/` returns zero hits.

This work brings all three inside the codebase's control, which means
`THREAT_MODEL.md:84` and `API_SECURITY_CHECKLIST.md:55` both become stale and
must be amended as part of the change.

## Non-goals

- **Email confirmation ("anyone can sign up as anyone").** This is a Supabase
  *project* setting, not code. `signUp` already handles the no-session case
  correctly (`if (!data.session) return { message: t("checkEmail") }`). Documented
  as an operator action; no code change.
- **Production Supabase Auth settings.** `minimum_password_length` and
  `password_requirements` in the hosted project are dashboard-managed. This
  branch changes `supabase/config.toml` (which governs the *local* stack) and
  documents the hosted values the operator must mirror. Claude cannot and does
  not change production settings.
- **Customer-portal MFA.** Deferred. v1 enforces MFA for platform admins and
  offers it to business members. Portal customers keep password + magic link.
- **CAPTCHA / bot defense.** Supabase supports hCaptcha/Turnstile via config;
  out of scope here and noted as follow-up.

## Global constraints

These bind every task and are copied verbatim into each reviewer's brief.

1. **Follow `AGENTS.md`.** Reuse existing components, Supabase helpers, and auth
   helpers. Reuse existing route-group patterns and the shadcn/Tailwind design
   language. Never introduce a second styling system.
2. **Validation modules are `.js` (ESM), not `.ts`** — see the header comment in
   `src/lib/validation/common.js`. They are authored as `.js` so the identical
   schema runs in Server Actions (imported from `.ts`) *and* in the offline
   `node --test tests/*.test.mjs` suite. New validation logic follows this.
3. **Curated, non-enumerating error messages.** Raw Zod issues, schema
   internals, and DB/SDK errors are never surfaced to the user. Auth failures
   must not reveal whether an account exists. Log stable codes only
   (`console.error("x failed", error.code)`), never message bodies.
4. **Fail closed toward "no privilege change", fail open only where stated.**
   The single deliberate fail-open is the breach-check network path (§3).
5. **i18n is mandatory.** Every user-facing string lands in both
   `src/messages/en.json` and `src/messages/ar.json`. No hardcoded English.
6. **Validation trio must pass** after each task: `pnpm lint`, `pnpm typecheck`,
   `pnpm build`. Plus `pnpm test` (302 tests green at baseline).
7. **Migrations are additive and sequentially numbered.** Next free number is
   `0031` (note: `0028` is absent upstream; do not backfill it).
8. **No secret material in logs, errors, or the client bundle.** A password, a
   TOTP secret, and a full SHA-1 password hash are all secret material.

## 1. Password policy

**Module:** `src/lib/validation/password.js` (new), consumed by both the client
component and the Server Action so the rule has exactly one definition.

Rules:
- Minimum 12 characters (raised from the current 8; Supabase local config still
  says 6).
- Maximum 72 **bytes**. bcrypt silently truncates past 72 bytes, so a longer
  password creates a false sense of strength — reject explicitly rather than
  truncate. Must be measured in UTF-8 bytes, not `.length`, or Arabic and emoji
  passwords are mis-measured.
- At least three of four character classes: lowercase, uppercase, digit, symbol.
- Must not contain the local-part of the user's own email (case-insensitive), and
  must not be a member of a small embedded common-password denylist.
- Rejects leading/trailing whitespace-only padding, control characters, and NUL.

**Client-side:** a `PasswordRequirements` component renders each rule as
met/unmet live as the user types. This is a UX affordance only — the server
re-runs the identical schema and is the authority. The component must never be
the only enforcement point.

## 2. Breached-password screening (HIBP k-anonymity)

**Module:** `src/lib/password-breach.js` (new).

- SHA-1 the candidate password, send **only the first 5 hex characters** to
  `https://api.pwnedpasswords.com/range/{prefix}`, and match the returned
  suffixes locally. The password never leaves the server, and the API learns
  nothing beyond a 5-character prefix shared by hundreds of thousands of hashes.
- Runs **server-side only**. Sending it from the browser would leak a prefix of
  the user's password hash to a third party from the user's own IP.
- Uses `Add-Padding: true` so response size does not leak whether the prefix had
  many or few hits.
- **Fails open.** A network error, non-200, timeout (3s), or malformed body
  results in "not known to be breached" plus a logged code. Rationale: HIBP is a
  third-party dependency on the signup path; an outage there must not become an
  outage here. This is the one deliberate fail-open in the design and is called
  out in the code comment and the test suite.
- The `fetch` implementation is injectable so tests never hit the network.

## 3. Rate limiting

**Store: Postgres.** There is no Redis in this stack and the app is serverless
(Vercel), so in-memory counters would be per-instance and effectively useless.
Supabase Auth applies its own per-IP limits upstream, but the Server Actions are
the surface actually exposed here.

**Migration `0031_auth_rate_limits.sql`:**
- Table `auth_rate_limits (bucket_key text primary key, window_start timestamptz,
  attempt_count int)`. RLS enabled with **no policies** — the table is
  unreachable by `anon`/`authenticated` and touched only through the RPC.
- `consume_rate_limit(scope text, identifier text)` — `SECURITY DEFINER`,
  `search_path` pinned. Returns whether the call is allowed.
  - **Scope is an allowlist**, and the limit/window for each scope live *in the
    RPC*, not in the arguments. A caller cannot request a generous limit.
  - The identifier is **hashed inside the RPC** (`encode(digest(...), 'hex')`)
    so raw emails and IPs are never stored in the counter table.
  - Increment is atomic via `INSERT … ON CONFLICT DO UPDATE` with the window
    roll-over handled in the same statement — no read-then-write race.
- `EXECUTE` granted to `anon` and `authenticated` (login is unauthenticated).

**Dual-key rule (important):** each protected action consumes **two** buckets —
one keyed on client IP, one keyed on the submitted email. Email-only keying lets
an attacker lock a victim out of their own account by hammering their address;
IP-only keying is defeated by a distributed attempt spread. Both must pass.

Scopes and limits:

| Scope | Limit | Window |
|---|---|---|
| `login_ip` | 20 | 15 min |
| `login_email` | 8 | 15 min |
| `password_reset_ip` | 10 | 60 min |
| `password_reset_email` | 5 | 60 min |
| `signup_ip` | 10 | 60 min |
| `magic_link_email` | 5 | 60 min |

Client IP derives from `x-forwarded-for` (first entry) via `headers()`, falling
back to `x-real-ip`. On Vercel this header is set by the platform edge. **When no
IP can be determined the request is treated as a single shared bucket** rather
than skipping the check — failing open on a missing header would make the limit
trivially bypassable.

Rate-limited responses return the same generic, non-enumerating message shape as
other auth failures and never disclose remaining quota.

## 4. Multi-factor authentication (TOTP)

Supabase Auth has native MFA (`supabase.auth.mfa.*`) — **no new dependency**.

**Enrollment** at `/settings/security` (new, `(dashboard)` group): enroll → render
the returned QR + manual secret → verify a code to activate → list active factors
→ unenroll (which itself requires a fresh code). Recovery is via the operator
(admin can unenroll a locked-out user), documented in the runbook; self-service
recovery codes are a follow-up.

**Challenge at login:** after `signInWithPassword` succeeds, if the user has a
verified factor the session is at AAL1 and must be elevated. The user is routed
to `/login/mfa` to satisfy a challenge before reaching any protected route.

**Enforcement in middleware** (`lib/supabase/middleware.ts`): today the gate is
binary — user or no user. It gains an AAL check derived from
`getAuthenticatorAssuranceLevel()`:
- `currentLevel < nextLevel` (a verified factor exists but the session has not
  satisfied it) → redirect to `/login/mfa`, with `/login/mfa` and `/auth/*` added
  to the public-path allowlist so the redirect cannot loop.
- **Platform admins must be at AAL2 to reach `/admin`.** An admin with no factor
  enrolled is redirected to `/settings/security` to enroll rather than being
  locked out. This is the change that closes `THREAT_MODEL.md:84`.

MFA remains optional for non-admin business members in v1.

## Testing

Every task lands `node --test` coverage in `apps/web/tests/`, matching the
existing `*-security.test.mjs` convention (including "release gate" assertions
that pin the security-relevant properties so a later refactor cannot quietly
undo them).

Pure-logic modules (password schema, breach check with injected `fetch`, bucket
key derivation, AAL decision function) are unit-tested offline. The AAL routing
decision must be extracted into a pure, exported function precisely so it is
testable without a live session — middleware behaviour is otherwise only
reachable end to end.

Database behaviour (`consume_rate_limit` atomicity, window roll-over, RLS
unreachability) is verified against the local Supabase stack via a script in
`apps/web/scripts/`, following the existing `e2e.mjs` precedent.

## Operator actions (cannot be done from code)

To be captured in `docs/security/AUTH_HARDENING.md`:

1. Enable **Confirm email** in the hosted Supabase project.
2. Set hosted **minimum password length = 12** and password requirements to match §1.
3. Enable Supabase's own **leaked password protection** if available on the plan
   (defence in depth alongside §2).
4. Enrol MFA for every existing `platform_admins` member before the AAL2 gate
   ships, or they will be redirected to enrollment on next login.
