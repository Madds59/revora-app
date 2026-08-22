# APPSEC-10 Authentication Hardening — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-08-21-auth-hardening-design.md` (binding authority)
**Branch:** `security/appsec-10-auth-hardening` (off `main` @ 67d25a2)
**Baseline:** 302 tests passing, lint clean, typecheck clean.

## Context for every implementer

Revora is a multi-tenant SaaS for automotive service businesses: Next.js 15 App
Router (RSC + Server Actions), Supabase (Postgres + Auth + Storage, RLS
everywhere), Tailwind v4 + shadcn/ui (`base-nova`), next-intl with `en`/`ar`
including RTL. App root is `apps/web`. Migrations live in `supabase/migrations/`.

Read `AGENTS.md` at the repo root before writing code — it is the project's
development constitution and it binds you.

## Global Constraints

Copied into every implementer and reviewer brief.

1. **Reuse before creating.** Existing components, Supabase helpers
   (`lib/supabase/{server,client,admin}.ts`), auth helpers (`lib/auth.ts`),
   route-group patterns, and the shadcn/Tailwind design language. Never
   introduce a second styling system.
2. **Validation modules are `.js` (ESM), never `.ts`.** See the header of
   `src/lib/validation/common.js` for why: the same schema must run inside
   Server Actions (imported from `.ts`) and inside the offline
   `node --test tests/*.test.mjs` suite. Import shared primitives from
   `./common.js`.
3. **Curated, non-enumerating errors.** Never surface raw Zod issues, schema
   internals, or DB/SDK error text. Auth responses must not reveal whether an
   account exists. Log stable codes only — `console.error("label", error.code)`
   — never message bodies, never secret material.
4. **Fail closed** toward "no privilege change" / "not authenticated". The single
   deliberate fail-open is the HIBP network path in Task 2, and it is explicitly
   specified there.
5. **i18n is mandatory.** Every user-facing string goes in BOTH
   `src/messages/en.json` and `src/messages/ar.json`, reached via `useTranslations`
   / `getTranslations`. No hardcoded English in components or actions. Arabic
   copy should be genuine Arabic, not English placeholder text.
6. **Validation trio after every task**, from `apps/web`:
   `pnpm lint && pnpm typecheck && pnpm test`. Run `pnpm build` too if you
   touched routing, middleware, or server/client component boundaries.
   IMPORTANT: never run `pnpm build` while a dev server is live on the same
   `.next` — it corrupts the webpack cache.
7. **Migrations are additive and sequentially numbered.** The next free number is
   `0031`. Do not backfill the absent `0028`. Never edit an existing migration.
8. **No secret material anywhere it can leak.** Passwords, TOTP secrets, and full
   SHA-1 password hashes must never reach logs, error strings, or the client
   bundle.
9. **Tests are mandatory, and they must be able to fail.** Follow the existing
   `tests/*-security.test.mjs` convention, including "release gate" assertions
   that pin security-relevant properties so a later refactor cannot silently
   undo them. A test that asserts nothing is a defect.

## Task 1: Password policy validation module

**Files:** create `apps/web/src/lib/validation/password.js`, create
`apps/web/tests/password-policy.test.mjs`.

Create the single canonical password rule set, consumed later by both the
Server Actions and the client component. Pure logic, no I/O, no React.

Export from `password.js`:

- `PASSWORD_MIN_LENGTH = 12`
- `PASSWORD_MAX_BYTES = 72`
- `passwordRules(password, { email } = {})` → array of
  `{ id, met: boolean }` for live client-side display. Rule ids exactly:
  `"length"`, `"lowercase"`, `"uppercase"`, `"digit"`, `"symbol"`, `"notEmail"`,
  `"notCommon"`.
- `passwordSchema({ email } = {})` → a Zod schema (import `z` from `"zod"`)
  producing curated messages.
- `firstValidationMessage` re-exported from `./common.js`, matching how
  `validation/admin.js` re-exports it.

Rules the schema enforces:

- Length ≥ 12 characters.
- UTF-8 **byte** length ≤ 72. Measure with
  `new TextEncoder().encode(password).length`, NOT `password.length` and NOT
  `Buffer.byteLength` — this module is imported by a CLIENT component in Task 3,
  where `Buffer` is not a browser global. bcrypt truncates silently past 72
  bytes, so a longer password gives false confidence; reject it explicitly.
  Getting this wrong mis-measures Arabic and emoji passwords, which matters for
  this product.

- At least **3 of these 4** classes present: lowercase `[a-z]`, uppercase `[A-Z]`,
  digit `[0-9]`, symbol (anything that is none of the other three and is not
  whitespace). Emit ONE curated message when fewer than 3 are present.
- Rejects any control character or NUL. Reuse the existing convention from
  `validation/admin.js`, which defines it as
  `const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/` written with ESCAPE
  SEQUENCES, never literal control bytes.
- Rejects a password whose trimmed form is empty.
- When `email` is supplied: case-insensitively rejects a password **containing**
  the email's local-part (text before `@`), when that local-part is ≥ 4
  characters. Below 4 characters the substring test produces too many false
  rejections to be worth it.
- Rejects members of an embedded common-password denylist, compared
  case-insensitively. Include at least these 20, as a plain array constant
  named `COMMON_PASSWORDS`: `password`, `password1`, `password123`,
  `123456`, `12345678`, `123456789`, `qwerty`, `qwerty123`, `letmein`,
  `welcome`, `welcome1`, `admin`, `admin123`, `iloveyou`, `monkey`,
  `dragon`, `sunshine`, `princess`, `football`, `changeme`.
  Also reject these with a trailing `!` or `1` appended.

**This module must stay browser-safe**: no `node:crypto`, no `Buffer`, no `fs`,
no network, no `next/*` imports. Task 3 imports `passwordRules` into a client
component, so anything Node-only here becomes a build failure there.

Do NOT put user-facing English into this module beyond the curated Zod messages
that mirror the existing style in `validation/common.js` — the client component
in Task 3 renders rule ids through i18n, which is why `passwordRules` returns
ids rather than sentences.

Tests must cover: each rule failing in isolation; the 3-of-4 boundary (exactly 2
classes fails, exactly 3 passes); a 72-byte Arabic/emoji password accepted at the
boundary and a 73-byte one rejected; local-part rejection including the
`< 4 chars` exemption; denylist with suffixes; and a release gate asserting the
module contains no `localStorage`, no network call, no `Buffer`, no `node:`
import, and that `TextEncoder` (not `.length`) is what bounds the maximum.

## Task 2: Breached-password screening via HIBP k-anonymity

**Files:** create `apps/web/src/lib/password-breach.js`, create
`apps/web/tests/password-breach.test.mjs`.

Server-only module that checks a candidate password against Have I Been Pwned
without ever transmitting the password or its full hash.

Export `isPasswordBreached(password, { fetchImpl = globalThis.fetch, timeoutMs = 3000 } = {})`
returning `Promise<{ breached: boolean, checked: boolean }>`.

Algorithm:

1. SHA-1 the password, uppercase hex. Use `node:crypto` `createHash("sha1")`.
   SHA-1 is not a security choice here — it is the hash HIBP's range API is
   keyed on. Say so in a comment so no future reader "upgrades" it and breaks
   the lookup.
2. Split into `prefix` (first 5 hex chars) and `suffix` (remaining 35).
3. GET `https://api.pwnedpasswords.com/range/${prefix}` with header
   `Add-Padding: true` (so response size cannot reveal whether the prefix had
   few or many hits) and an `AbortSignal.timeout(timeoutMs)`.
4. The body is lines of `SUFFIX:COUNT`. Match `suffix` case-insensitively.
   A padded entry has count `0` and must NOT count as a breach.
5. Return `{ breached: true|false, checked: true }`.

**Fail-open contract (the one deliberate fail-open in this design):** any
non-200, network error, timeout, or malformed body returns
`{ breached: false, checked: false }` and logs a stable code only, e.g.
`console.error("password breach check unavailable", code)`. HIBP is a
third-party dependency sitting on the signup path; an outage there must not
become an outage here. Write this rationale as a comment in the module — it is
the kind of decision a later reader will otherwise "fix".

The full hash must never be logged, returned, or sent. Only the 5-character
prefix leaves the process.

`fetchImpl` is injectable purely so tests never touch the network — every test
passes a stub.

Tests must cover: a known-breached suffix present in a stubbed response; a
clean password; padding entries with count `0` ignored; case-insensitive suffix
matching; non-200 → `checked:false, breached:false`; thrown network error →
same; timeout → same; malformed body → same; and a release gate asserting the
request URL contains only the 5-char prefix and that the full hash appears
nowhere in the outbound request or in any logged string.

## Task 3: Enforce the password policy in actions and UI

**Files:** modify `apps/web/src/app/[locale]/(auth)/actions.ts`; create
`apps/web/src/components/password-requirements.tsx`; modify
`apps/web/src/app/[locale]/(auth)/signup/signup-client.tsx` and
`apps/web/src/app/[locale]/(auth)/reset-password/reset-password-client.tsx`;
modify `apps/web/src/messages/en.json` and `apps/web/src/messages/ar.json`;
create `apps/web/tests/password-enforcement.test.mjs`.

Server side, in `actions.ts`:

- In `signUp`, replace the existing `if (password.length < 8) return { error: t("passwordMin") }`
  with `passwordSchema({ email })` parsed via `safeParse`, surfacing
  `firstValidationMessage(parsed)`.
- In `updatePassword`, replace its `password.length < 8` check the same way.
  It has no email in scope; call `passwordSchema()` with no argument.
- In BOTH, after the schema passes, `await isPasswordBreached(password)` and
  reject with a curated i18n message when `breached === true`. When
  `checked === false`, proceed — that is the fail-open path from Task 2.
- Keep the existing `confirm_password` mismatch check in `updatePassword`.

Client side:

- `PasswordRequirements` is a client component taking `password` and optional
  `email` props, calling `passwordRules()` from Task 1 and rendering each rule
  with a met/unmet indicator. Render rule ids through `useTranslations`, keyed
  `auth.password.rules.<id>`. Use existing shadcn primitives and the existing
  design language — do not invent new styling. It must be RTL-safe: use
  logical properties / existing RTL-aware utilities, not hardcoded `left`/`right`.
- Wire it into the signup and reset-password forms as controlled input state.
  Update `minLength={8}` to `minLength={12}` on those inputs.
- The component is a UX affordance ONLY. The server re-runs the identical schema
  and remains the authority. State this in a comment so nobody later "optimizes"
  the server check away.

i18n keys to add to BOTH `en.json` and `ar.json`, with real Arabic copy:
`auth.password.rules.length`, `.lowercase`, `.uppercase`, `.digit`, `.symbol`,
`.notEmail`, `.notCommon`, plus `auth.actions.passwordBreached` and
`auth.password.requirementsTitle`.

Tests: assert both actions call the schema and the breach check before touching
Supabase; assert a breached password is rejected; assert `checked:false`
proceeds; assert the two message files have identical key sets for everything
under `auth.password` (a missing Arabic key is a real, shippable bug); release
gate asserting neither client component is the sole enforcement point — i.e.
`actions.ts` still imports and calls `passwordSchema`.

## Task 4: Rate-limit store — migration and RPC

**Files:** create `supabase/migrations/0031_auth_rate_limits.sql`; create
`apps/web/scripts/verify-rate-limit.mjs`.

Postgres-backed counter, because the app is serverless (per-instance memory is
useless) and there is no Redis in this stack.

Migration contents:

- Table `public.auth_rate_limits`:
  `bucket_key text primary key`, `window_start timestamptz not null default now()`,
  `attempt_count integer not null default 0`.
- `alter table public.auth_rate_limits enable row level security;` and define
  **no policies at all** — the table must be unreachable by `anon` and
  `authenticated`, touched only through the SECURITY DEFINER RPC below. Add a
  comment saying the absence of policies is deliberate.
- Ensure `pgcrypto` is available for `digest()` (`create extension if not exists pgcrypto with schema extensions;`
  — check how existing migrations reference extensions and match that).
- `create or replace function public.consume_rate_limit(scope text, identifier text)
  returns boolean` — `language plpgsql`, `security definer`,
  `set search_path = public, extensions`.

RPC behaviour:

- **Scope is an allowlist and the limits live inside the function**, never in the
  arguments — a caller must not be able to request a generous limit. Use a
  `case scope when … end` mapping to `(max_attempts, window_seconds)`:
  - `login_ip` → 20, 900
  - `login_email` → 8, 900
  - `password_reset_ip` → 10, 3600
  - `password_reset_email` → 5, 3600
  - `signup_ip` → 10, 3600
  - `magic_link_email` → 5, 3600
  - anything else → `raise exception` (fail closed on an unknown scope).
- Hash the identifier inside the function so raw emails and IPs are never
  stored: `bucket_key := scope || ':' || encode(digest(lower(identifier), 'sha256'), 'hex')`.
- Atomic increment with window roll-over in a SINGLE statement — no
  read-then-write race:
  `insert … values (bucket_key, now(), 1) on conflict (bucket_key) do update set
   window_start = case when auth_rate_limits.window_start < now() - make_interval(secs => window_seconds) then now() else auth_rate_limits.window_start end,
   attempt_count = case when auth_rate_limits.window_start < now() - make_interval(secs => window_seconds) then 1 else auth_rate_limits.attempt_count + 1 end
   returning attempt_count into v_count;`
- Return `v_count <= max_attempts`.
- `revoke all on function public.consume_rate_limit(text, text) from public;`
  FIRST, then `grant execute on function public.consume_rate_limit(text, text)
  to service_role;` — and nothing else.
  **CORRECTED 2026-08-22 after Task 4's review.** This originally read
  "`to anon, authenticated` — login is unauthenticated, so `anon` genuinely needs
  it." That was wrong: it confused the END USER being unauthenticated with the
  DATABASE CALLER being `anon`. Server Actions run server-side and call through
  the service-role client. An `anon` grant exposes the RPC at
  `POST /rest/v1/rpc/consume_rate_limit` to anyone holding the public anon key,
  letting them burn a known victim's `login_email` bucket in 8 requests and lock
  them out for 15 minutes — a targeted account-lockout weapon, strictly worse
  than the brute-force it prevents.
  The `revoke from public` is NOT optional and NOT stylistic: Postgres grants
  `EXECUTE` to `PUBLIC` on every newly created function, and `anon` is a member
  of `PUBLIC`, so dropping the `anon` grant without the revoke changes nothing.
- Follow the GRANT conventions already established in `0003_api_grants.sql`, and
  the `revoke ... from public` convention used by every other SECURITY DEFINER
  function in this migration set (e.g. `0004:46`, `0030:233-235`).

`verify-rate-limit.mjs` follows the existing `apps/web/scripts/e2e.mjs`
precedent (same env var handling and reporting style) and verifies against the
local stack: the Nth call flips to `false`; the window rolls over; two different
scopes do not share a bucket; identical identifiers in different scopes stay
independent; and `anon` selecting from `auth_rate_limits` directly is denied.
Do not run it in CI — document the command in the script header. If a local
Supabase stack is not reachable, the script must exit with a clear message
rather than a stack trace.

## Task 5: Apply rate limiting to the auth actions

**Files:** create `apps/web/src/lib/rate-limit.ts`; modify
`apps/web/src/app/[locale]/(auth)/actions.ts`; modify
`apps/web/src/messages/en.json` and `ar.json`; create
`apps/web/tests/rate-limit.test.mjs`. Also create
`apps/web/src/lib/validation/rate-limit-key.js` for the pure key/IP derivation
so it is unit-testable offline (constraint 2 applies — `.js`).

`rate-limit-key.js` exports `clientIpFrom(headerGetter)`, resolving the client IP
in this precedence, most-trusted first:

1. `x-vercel-forwarded-for` — set by the platform edge, not client-settable.
2. `x-real-ip`.
3. `x-forwarded-for`, taking the **LAST** comma-separated entry, trimmed.
4. Otherwise the constant string `"unknown"` — a shared bucket.

**CORRECTED 2026-08-22 after Task 5's review.** This originally said to take the
FIRST `x-forwarded-for` entry. That entry is attacker-controlled whenever the edge
APPENDS rather than overwrites, so an attacker sending a random valid IPv4 per
request lands in a fresh bucket every time — reducing `login_ip`, `signup_ip`, and
`password_reset_ip` to no protection at all. With a trusted appending proxy the
RIGHTMOST hop is the one your own edge added, so it is the attacker-resistant
choice. Where the edge overwrites XFF with a single value, first and last are
identical and the change is inert.

It must NOT return null or signal "skip": failing open on a missing header would
make the limit trivially bypassable by stripping it. Note that in a comment.

Validate the extracted value looks like an IP and fall back to `"unknown"` if not.
Normalize an `::ffff:` prefix off IPv4-mapped IPv6 and strip any `%zone` suffix
BEFORE validating — `::ffff:192.0.2.1` is what nginx `$remote_addr` and Node
`req.socket.remoteAddress` emit on a dual-stack listener, and rejecting it
collapses every client into the shared `"unknown"` bucket, turning `login_ip`'s
20/15min into a site-wide login outage.

**Do not overclaim the shape check in comments.** It bounds the character set, not
the cardinality: `IPV4_RE` alone admits ~4.3 billion valid buckets. No shape
validator can prevent a forged header minting unbounded distinct buckets — only a
trusted edge-set header can. Say so honestly, because an overclaiming comment is
how a real gap gets ignored.

**You must also declare the RPC in `apps/web/src/lib/database.types.ts`.** That
file is HAND-AUTHORED (a curated subset, not generated output) — see its
`Functions` block around line 3389 where `claim_customer_records` and
`create_business` are declared. `supabase.rpc("consume_rate_limit", …)` will not
typecheck until you add an entry alongside them, shaped
`consume_rate_limit: { Args: { scope: string; identifier: string }; Returns: boolean }`.
Match the surrounding style exactly. Do NOT regenerate the file with
`supabase gen types` — that would drop the named exports the rest of the app
relies on.

`rate-limit.ts` exports `checkRateLimit(scope, identifier)` calling
`supabase.rpc("consume_rate_limit", { scope, identifier })`, plus
`enforceAuthRateLimit({ scopes })` taking a list of `[scope, identifier]` pairs.
**If the RPC itself errors, deny** (fail closed) and log a stable code — a broken
limiter must not silently disable protection.

**Call it through the SERVICE-ROLE client** (`lib/supabase/admin.ts`), NOT the
request-scoped server client. Task 4's review established why: `EXECUTE` on
`consume_rate_limit` is granted only to `service_role`, and revoked from `public`
(and therefore from `anon`). If it were reachable by `anon`, the RPC would be
callable directly at `POST /rest/v1/rpc/consume_rate_limit` with the public anon
key, letting anyone who knows a victim's email burn that victim's `login_email`
bucket in 8 requests and lock them out for 15 minutes — turning the limiter into
a targeted account-lockout weapon. The Server Action runs server-side, so the
service-role client is both available and correct here.

`lib/supabase/admin.ts` is server-only. Importing it into a client component
would leak the service-role key into the browser bundle — never do that. It
belongs in `rate-limit.ts`, which only `actions.ts` imports.

**Never batch several `consume_rate_limit` calls into one transaction.** Postgres
`now()` is `transaction_timestamp()`, so calls sharing a transaction would share a
frozen clock and mis-evaluate window roll-over. One RPC call per bucket, as
separate statements, is correct.

Wire into `actions.ts`, each consuming BOTH an IP bucket and an identifier
bucket (both must pass — see the spec's dual-key rationale: email-only keying
lets an attacker lock a victim out; IP-only keying is beaten by distribution):

- `signIn` → `login_ip` + `login_email`
- `signUp` → `signup_ip`
- `requestPasswordReset` → `password_reset_ip` + `password_reset_email`
- `signInWithMagicLink` → `magic_link_email` + `login_ip`

The check runs BEFORE the Supabase call. On rejection return a curated i18n
message (`auth.actions.tooManyAttempts`, added to both message files) that
discloses neither remaining quota nor whether the account exists. Preserve the
existing behaviour that `requestPasswordReset` and `signInWithMagicLink` return
a success-shaped message regardless of account existence.

Tests: `clientIpFrom` across `x-forwarded-for` single/multiple/spaced values,
`x-real-ip` fallback, missing headers → `"unknown"`, and a forged non-IP value →
`"unknown"`; `enforceAuthRateLimit` denying when any one scope denies; RPC error
→ denied (fail closed); a release gate asserting each of the four actions
consumes its specified scopes and that the limiter runs before the Supabase auth
call.

## Task 6: MFA enrollment (TOTP)

**Files:** create `apps/web/src/app/[locale]/(dashboard)/settings/security/page.tsx`
and `security-client.tsx` and `actions.ts`; modify `apps/web/src/messages/en.json`
and `ar.json`; create `apps/web/tests/mfa-enrollment.test.mjs`. Add a link to the
new page from `apps/web/src/app/[locale]/(dashboard)/settings/page.tsx`.

Uses Supabase's native MFA — `supabase.auth.mfa.*`. **Add no new dependency**;
in particular do not add a QR library, because `enroll()` already returns
`data.totp.qr_code` as an SVG data URI.

Server actions (`"use server"`, each starting from `requireUser()`):

- `startEnrollment` → `supabase.auth.mfa.enroll({ factorType: "totp", friendlyName })`.
  Return `factorId`, `qr_code`, and `secret`. Handle the case where an unverified
  factor already exists (Supabase errors on a duplicate friendly name) by
  unenrolling the stale unverified factor first, then re-enrolling — otherwise a
  user who abandons enrollment can never restart it.
- `verifyEnrollment(factorId, code)` → `mfa.challenge` then `mfa.verify`.
- `unenrollFactor(factorId, code)` → requires a fresh valid code via
  challenge+verify BEFORE `mfa.unenroll`. Removing a second factor is a
  privilege reduction and must itself be authenticated.

All three return the project's `{ error?, message? }` state shape used by the
existing `useActionState` forms, with curated non-enumerating messages. Never log
or return the TOTP `secret` beyond the single enrollment response that the user
must see to configure their authenticator.

UI: list verified factors with friendly name and creation date; enroll flow
showing the QR plus the manual secret (for authenticator apps that cannot scan);
a 6-digit code input to activate; unenroll with code confirmation. Use existing
shadcn card/button/input/label patterns and existing empty/loading/error state
conventions per `AGENTS.md`. Must be RTL-safe. The 6-digit input must accept
digits only and must not be `type="number"` (spinners and locale grouping break
OTP entry) — use `inputMode="numeric"` with `pattern="[0-9]*"` and
`autoComplete="one-time-code"`.

i18n: all strings in both message files with real Arabic copy.

Tests: pure-logic coverage of the stale-unverified-factor recovery path and the
"unenroll requires a fresh code" rule using a stubbed Supabase MFA client;
release gate asserting `unenrollFactor` cannot reach `mfa.unenroll` without a
successful verify first, and that no new QR dependency was added to
`package.json`.

## Task 7: MFA challenge at login, AAL enforcement, config and docs

**Files:** create `apps/web/src/lib/mfa-gate.js` (pure decision logic — `.js` per
constraint 2) and `apps/web/src/app/[locale]/(auth)/login/mfa/page.tsx` +
`mfa-client.tsx`; modify `apps/web/src/lib/supabase/middleware.ts`; modify
`apps/web/src/app/[locale]/(auth)/actions.ts`; modify
`apps/web/src/messages/en.json` and `ar.json`; modify
`supabase/config.toml`; modify `docs/security/THREAT_MODEL.md` and
`docs/security/API_SECURITY_CHECKLIST.md`; create
`docs/security/AUTH_HARDENING.md`; create `apps/web/tests/mfa-gate.test.mjs`.

`mfa-gate.js` exports the pure routing decision so middleware behaviour is
testable offline — this extraction is required, not optional:

`mfaRedirectFor({ currentLevel, nextLevel, isSuperAdmin, hasVerifiedFactor, path })`
returning `null` | `"/login/mfa"` | `"/settings/security"`.

Rules:

- `currentLevel === "aal1" && nextLevel === "aal2"` (a verified factor exists but
  this session has not satisfied it) → `"/login/mfa"`.
- `isSuperAdmin && !hasVerifiedFactor` → `"/settings/security"`. An admin with no
  factor is sent to ENROLL, never locked out. This is what closes
  `THREAT_MODEL.md:84`.
- `isSuperAdmin && currentLevel !== "aal2"` and the path is under `/admin` →
  `"/login/mfa"`. Platform admins must be AAL2 to reach `/admin`.
- Otherwise `null`.
- Return `null` when `path` is already the redirect target, and for `/auth/*` —
  a gate that redirects to its own target is an infinite loop.

Middleware: after the existing `getUser()` call, obtain AAL via
`supabase.auth.mfa.getAuthenticatorAssuranceLevel()`, call `mfaRedirectFor`, and
issue a locale-prefixed redirect when it returns a path. Add `/login/mfa` to
`isPublicPath` so an AAL1 session can reach the challenge page. Preserve the
existing locale-splitting behaviour exactly — reuse `splitLocale`.

**Do NOT import `isSuperAdmin` from `lib/auth.ts` into the middleware.** That
helper builds its client through `lib/supabase/server.ts`, which calls
`cookies()` from `next/headers` — unavailable in middleware, which has its own
request-scoped client. Query `platform_admins` using the middleware's LOCAL
`supabase` instance already constructed in `updateSession`. To keep this off the
hot path, run the admin lookup only when the de-localized path starts with
`/admin` or when AAL indicates a factor exists; a plain dashboard request must
not gain an extra round trip on every navigation.

`/login/mfa` page: lists the user's factors, takes a 6-digit code (same input
rules as Task 6), calls `mfa.challenge` + `mfa.verify` in a server action, and
redirects onward on success. Sign-out must remain reachable from this page so a
user who lost their authenticator is not trapped.

`supabase/config.toml`: set `minimum_password_length = 12` (currently 6) to
match Task 1. **Leave `password_requirements = ""` as it is** — do NOT set
`"lower_upper_letters_digits"`. That Supabase option demands lowercase AND
uppercase AND digits, which is strictly stronger than Task 1's 3-of-4 rule: a
password of lower+upper+symbol passes our schema and would then be rejected by
the Auth API, surfacing a RAW SUPABASE ERROR STRING to the user and violating
global constraint 3. Our curated schema stays the single authority on
composition; `minimum_password_length` is the only backstop we align. Record
this reasoning in `AUTH_HARDENING.md`.

Leave the existing `[auth.rate_limit]` block alone — it governs Supabase's own
limits, which are complementary to ours, and changing them is out of scope.

Docs:

- `THREAT_MODEL.md:84` currently says admin compromise is "mitigated only by
  admin account hygiene (MFA, credential strength) — **outside this codebase's
  control**". Amend it: MFA is now enforced in-codebase for platform admins via
  the AAL2 gate. Do not delete the row — update the mitigation and note the
  residual risk (a compromised session that already satisfied AAL2).
- `API_SECURITY_CHECKLIST.md:55-57` currently records that no centralized rate
  limiting exists and defers it. Amend to describe what shipped (Postgres-backed
  `consume_rate_limit`, the six scopes, dual-key IP+identifier) and narrow the
  remaining gap to non-auth routes.
- `AUTH_HARDENING.md` is new: what shipped across Tasks 1-7, and an
  **Operator Actions** section listing what only a human with dashboard access
  can do — enable Confirm Email; set hosted minimum password length to 12 and
  matching requirements; enable Supabase leaked-password protection if the plan
  offers it; and enrol MFA for every existing `platform_admins` member BEFORE
  this ships, or they will be redirected to enrollment on next login.

  It must ALSO carry two items surfaced by earlier reviews:

  **(a) Migration 0031 was edited in place.** Task 4's `0031_auth_rate_limits.sql`
  was amended after first being written (to revoke the `anon` EXECUTE grant). Any
  database where the ORIGINAL 0031 already ran will never receive those revokes —
  Supabase's migration ledger records 0031 as applied and will not re-execute it,
  so the RPC would remain callable with the public anon key. Local was covered by
  `supabase db reset --local`, and this branch has not been pushed, so the risk is
  currently nil. The operator must confirm 0031 was never applied to any shared or
  hosted environment; if it was, a follow-up migration carrying only the three
  revokes is required.

  **(b) Why `password_requirements` is deliberately left empty.** Record the
  reasoning from Task 7's config change below, so a future operator does not
  "harden" it in the dashboard and start surfacing raw Supabase error strings.

Tests: exhaustive `mfaRedirectFor` truth-table coverage including both
loop-prevention cases; a release gate asserting middleware calls `mfaRedirectFor`
rather than reimplementing the decision inline, and that `/login/mfa` is in the
public-path allowlist. Run `pnpm build` for this task — it touches middleware and
routing.
