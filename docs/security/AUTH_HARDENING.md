# Authentication Hardening (APPSEC-10)

What shipped on the `appsec-10-auth-hardening` branch, why each piece is shaped
the way it is, and — critically — the **Operator Actions** that no amount of
code can perform, because they live in the hosted Supabase dashboard rather
than in this repository.

Companions: [THREAT_MODEL.md](THREAT_MODEL.md) (platform-admin row),
[API_SECURITY_CHECKLIST.md](API_SECURITY_CHECKLIST.md) (rate-limiting
inventory), [DEPLOYMENT_SECURITY_CHECKLIST.md](DEPLOYMENT_SECURITY_CHECKLIST.md).

---

## 1. What shipped

### Task 1 — Canonical password policy

`apps/web/src/lib/validation/password.js` is the **single authority** on whether
a password is acceptable:

- minimum **12** characters (`PASSWORD_MIN_LENGTH`);
- maximum **72 bytes** (`PASSWORD_MAX_BYTES`) — bcrypt truncates silently past
  that, so anything longer gives a false sense of strength;
- at least **3 of 4** character classes (lowercase, uppercase, digit, symbol);
- rejects control characters, the user's own email local-part, and a small
  denylist of common passwords plus their trivial `!`/`1` suffix variants.

The module is plain `.js` and locale-free by design: it ships in the client
bundle for the live requirements checklist, so it returns stable dot-codes
(`password.tooShort`, `password.classes`, …), never English prose.

### Task 2 — Breached-password screening (HIBP, k-anonymity)

`apps/web/src/lib/password-breach.js` SHA-1s the password locally and sends only
the **first 5 hex characters** of the hash to `api.pwnedpasswords.com/range/`.
The password never leaves the process.

**Fails OPEN, deliberately.** A network error, timeout (3 s) or malformed body
returns `{ breached: false, checked: false }`, and only a confirmed
`breached && checked` blocks the attempt. HIBP being unreachable must never
become "nobody can sign up". This is the exact opposite of the rate limiter's
contract below — do not "align" the two.

### Task 3 — Enforcement and curated errors

`(auth)/actions.ts` applies the schema and the breach check to signup and
password reset, server-side, as the sole authority; the client checklist is a UX
affordance only. Password failures resolve through the
`auth.password.errors.<code>` message namespace in both `en.json` and `ar.json`,
with a `generic` fallback so a raw code can never render to a user. No Supabase
`error.message` is ever returned to the client — only `error.code` is logged.

### Task 4 — Postgres-backed rate-limit store

`supabase/migrations/0031_auth_rate_limits.sql` adds
`public.consume_rate_limit(scope, identifier)`, a `SECURITY DEFINER` function
holding its own scope allowlist, limits and windows. The backing table has RLS
enabled with **zero policies** and all grants revoked from `anon`/`authenticated`
— it is reachable only through the function. Identifiers are hashed before
storage, so raw emails and IPs are never persisted. `EXECUTE` is revoked from
`public`, `anon` and `authenticated` (all three are independent grants; see
§3(a)).

### Task 5 — Rate limiting wired into the auth actions

`apps/web/src/lib/rate-limit.ts` calls the RPC through the **service-role**
client and **fails CLOSED**: any RPC error, missing service-role key, or thrown
client-construction error denies the attempt. Six scopes:

| Scope | Limit | Window |
|---|---|---|
| `login_ip` | 20 | 15 min |
| `login_email` | 8 | 15 min |
| `password_reset_ip` | 10 | 1 h |
| `password_reset_email` | 5 | 1 h |
| `signup_ip` | 10 | 1 h |
| `magic_link_email` | 5 | 1 h |

Sign-in, magic link and password reset are **dual-keyed** (IP bucket *and*
identifier bucket): an identifier-only bucket lets an attacker lock a victim
out, and an IP-only bucket is beaten by rotating IPs. Signup is IP-only by
design — it does not yet authenticate anyone, so a per-email bucket would only
add a lockout surface.

### Task 6 — TOTP MFA enrollment, verification and removal

`/settings/security` lets a user enroll an authenticator app, activate it with a
current code, and remove it. Ordering rules live in
`apps/web/src/lib/validation/mfa.js`:

- a factor counts as protection only once `verify()` succeeds — an abandoned
  (unverified) enrollment never counts;
- enrollment uses one fixed, non-localized friendly name
  (`revora-authenticator`) so a retry after an abandoned attempt collides
  deterministically and can be recovered — but a **verified** factor under that
  name is never unenrolled behind the user's back;
- removing a factor requires a **fresh** challenge+verify first: dropping a
  second factor is a privilege reduction and must itself be authenticated;
- "wrong code", "unknown factor id" and "rejected challenge" all resolve to the
  same message, so the failure path cannot be used to probe which factor ids
  exist.

### Task 7 — MFA challenge at sign-in, and AAL enforcement

`apps/web/src/lib/mfa-gate.js` holds the whole routing decision as one pure
function, `mfaRedirectFor({ currentLevel, nextLevel, isSuperAdmin,
hasVerifiedFactor, path })`:

1. `/auth/*` is never gated — gating it would break the very callback that
   establishes the session.
2. `currentLevel === "aal1" && nextLevel === "aal2"` — the session owns a
   verified factor it has not used — → `/login/mfa`. This applies to every user,
   not only admins.
3. Under `/admin` only: a platform admin with **no** verified factor →
   `/settings/security` (enroll), never a lockout.
4. Under `/admin` only: a platform admin not at `aal2` → `/login/mfa`.
5. Otherwise no redirect; and whatever the rules produce is discarded when the
   request is already at (or inside) that destination.

`nextLevel === "aal2"` is derived by the SDK from **verified** factors only, so
an abandoned enrollment cannot satisfy the gate.

**Why rules 3 and 4 are scoped to `/admin`** (brief amendment, 2026-08-22): the
control being bought is "MFA is required to reach the platform admin area", and
scoping buys exactly that — an admin's non-admin access is governed by the same
session either way, so firing globally adds no security. What firing globally
*would* add is a total-lockout failure mode that is reachable in production: see
§3(b). Scoped, the same misconfiguration costs an admin only `/admin`.

The middleware (`apps/web/src/lib/supabase/middleware.ts`) only gathers inputs.
`getAuthenticatorAssuranceLevel()` is computed from the session `getUser()`
already refreshed and costs no extra network call; the `platform_admins` lookup
does cost a round trip, so it is issued **only** for requests under `/admin` —
a plain dashboard navigation gains nothing. `isSuperAdmin` from `lib/auth.ts` is
deliberately not used there: it builds its client via `lib/supabase/server.ts`,
which calls `cookies()` from `next/headers`, which does not exist in middleware.

`/settings/security` sits in its own `(account)` route group rather than under
`(dashboard)`. This is load-bearing, not cosmetic: the dashboard layout's
`requireMembership()` redirects a user with no business membership away — and a
platform admin specifically to `/admin`, which the gate then redirects straight
back to `/settings/security`. That is an infinite loop, and it lands on exactly
the user class the gate targets (a platform admin holding no business
membership). Moving the destination out of `(dashboard)` also makes enrollment
reachable for customer-portal users, who were previously bounced to `/portal`.

`supabase/config.toml` sets `minimum_password_length = 12` to match Task 1.
`password_requirements` is left `""` — see §3(c) before changing it.

---

## 2. Known residuals

- **THE BIG ONE — the AAL2 requirement is a Next.js ROUTING control only. The
  `admin_*` RPCs do not check assurance level, and remain callable with an aal1
  token.** `is_super_admin()` (`0009_platform_admins.sql:21-31`) tests only
  `platform_admins` membership; every `admin_*` function carries
  `grant execute … to authenticated`; and no migration in this repository
  references `aal2` or `assurance` at all. An attacker with stolen admin
  credentials and no second factor therefore holds a perfectly valid aal1 token
  and can `POST /rest/v1/rpc/admin_list_users` — and every sibling RPC —
  directly at PostgREST, never touching middleware. **The gate raises the bar
  for the admin console, not for the data behind it.** Read "MFA is required
  for admin access" as true of the UI and false of the database until the
  follow-up below lands.

  Recommended follow-up, **as its own task**: add
  `(auth.jwt() ->> 'aal') = 'aal2'` to `is_super_admin()` (or to each `admin_*`
  function). **The rollout ordering is not optional** — applying it early
  revokes data access from every admin who has not yet enrolled, including in
  an environment where hosted TOTP is disabled and enrollment *cannot* succeed,
  which is the exact lockout the gate's `/admin` scoping was amended to avoid:

  1. confirm TOTP is enabled on the hosted project (§3(b));
  2. enrol every existing `platform_admins` member, and verify each one truly
     has a factor with status `verified` — not merely an enrollment started;
  3. only then apply the enforcement migration;
  4. have a rollback migration written and staged *before* you apply it.
- **The `/login/mfa` code submission has no rate-limit bucket of its own.**
  Adding one means adding a scope to `consume_rate_limit`'s allowlist, which
  must happen in a *new* migration (§3(a)). GoTrue is *assumed* to apply its own
  limit to `mfa.verify` — its `over_request_rate_limit` code is handled and maps
  to the curated "too many attempts" copy — but that limit is **not configurable
  from `config.toml`** (the `[auth.rate_limit]` block has no MFA-verify knob) and
  has **not been verified here**. Do not count it as a measured control. Worth
  closing properly if MFA becomes mandatory for all users.
- **`updatePassword` (`(auth)/actions.ts`) has no rate-limit bucket at all —
  not even an assumed one.** Unlike the other auth actions, this one runs for
  an already-authenticated session, so the existing IP/email scopes don't fit
  it cleanly; it was left out of Task 5's scope list rather than reusing one
  that doesn't match. The practical cost: it fires an unmetered outbound HIBP
  request per call (`isPasswordBreached`, 3 s timeout, fails open on its own —
  see Task 2 above) with nothing bounding how often a session can trigger that
  network call. Adding a scope needs a new migration (§3(a)) and is tracked as
  a follow-up, not part of this branch. See
  [API_SECURITY_CHECKLIST.md](API_SECURITY_CHECKLIST.md) for the same gap
  stated against the inventory table.
- **Password recovery interacts with the gate.** A user with a verified factor
  who follows a reset link arrives at AAL1 and is sent to `/login/mfa` first.
  This is intended (email access alone must not bypass the second factor); the
  challenge preserves the destination in `?next=` and returns them to the reset
  page afterwards. The `next` value is sanitized by `safeReturnPath` — anything
  not unambiguously internal collapses to `/`.
- **A session that has already satisfied AAL2 and is then stolen** retains full
  reach until it expires. The gate authenticates the sign-in, not each request.
- **Recovery codes are not implemented.** A user who loses their authenticator
  needs an operator to remove the factor for them (Supabase dashboard →
  Authentication → Users → the user's factors). Sign-out is reachable from
  `/login/mfa` and from the `(account)` header so nobody is trapped on a page.

---

## 3. Operator Actions

**Everything in this section requires a human with Supabase dashboard access.
None of it can be done from this repository, and three of these items will
silently degrade the controls above if skipped.**

### (a) REQUIRED FIRST — confirm migration `0031` was never applied anywhere shared

`supabase/migrations/0031_auth_rate_limits.sql` was **edited in place** after it
was first written: a later revision added the revokes of `EXECUTE` on
`consume_rate_limit` from `public`, `anon` and `authenticated`.

Supabase's migration ledger records `0031` as applied by its version number. A
database that ran the **original** 0031 will therefore **never** receive those
revokes — the ledger will not re-execute it, and no error is raised. The
consequence is not cosmetic: `consume_rate_limit` stays reachable as
`POST /rest/v1/rpc/consume_rate_limit` with the **public anon key**, so anyone
who knows a victim's email address can burn that victim's `login_email` bucket
in eight unauthenticated requests and lock them out of sign-in for 15 minutes.

Current exposure is nil *as far as this repository can tell*: the local stack
was rebuilt with `supabase db reset`, and this branch is unpushed. That is an
assumption about history, not a guarantee — **verify it**.

1. For every shared, staging or production project, check whether `0031` is in
   the applied-migrations list.
2. If it is not, nothing to do — the amended file will apply correctly on first
   run.
3. If it **is**, confirm the grants directly:

   ```sql
   select grantee, privilege_type
   from information_schema.routine_privileges
   where routine_name = 'consume_rate_limit';
   ```

   If `anon`, `authenticated` or `PUBLIC` appear, add a **new** migration
   (`0032_…`) carrying only the three revokes. Never re-edit 0031 again.

### (b) REQUIRED BEFORE THE AAL GATE GOES LIVE — enable TOTP on the hosted project

`supabase/config.toml` configures **only the local CLI stack**. No workflow in
this repository pushes it to a hosted project. Task 6 set
`[auth.mfa.totp] enroll_enabled = true` / `verify_enabled = true` there so the
feature works locally — that setting has **no effect on production**.

If the hosted project has MFA disabled (dashboard → Authentication →
Multi-Factor Authentication), `/settings/security` ships **dead**: enrollment
fails with the deliberately generic `enrollFailed` copy, and there is no
operator signal distinguishing "platform setting" from "bug". With the AAL gate
live, a platform admin with no factor would then be redirected to an enrollment
page that *cannot possibly succeed* — losing them the admin area.

**Enable TOTP on the hosted project, and enroll at least one factor
successfully, before this branch is deployed.** The `/admin` scoping in rule 3
is what keeps this recoverable rather than catastrophic, but it is a safety net,
not a substitute for the check.

### (c) DO NOT set `password_requirements` in the dashboard

Leave it empty, exactly as `supabase/config.toml` does.

Every supported value demands specific character **classes** —
`lower_upper_letters_digits` requires lowercase AND uppercase AND digits — which
is strictly *stronger* than Task 1's 3-of-4 rule, not equivalent to it. A
`lower + upper + symbol` password passes `passwordSchema` and would then be
rejected by the Auth API. The user would see a **raw Supabase error string**:
unlocalized (breaking Arabic entirely) and bypassing the curated
`auth.password.errors.*` copy Task 3 exists to provide.

`passwordSchema` stays the single authority on composition.
`minimum_password_length` is the one rule that is safe to mirror, because our
schema rejects anything shorter first — the Auth API can only ever agree with
it.

### (d) Enroll MFA for every existing `platform_admins` member — before deploy

Once the gate is live, any platform admin without a verified factor is
redirected to `/settings/security` the next time they open `/admin`. That is by
design and is recoverable, but it is a surprise if unannounced — and it is only
recoverable if (b) is already done.

```sql
select user_id from public.platform_admins;
```

Walk each one through `/settings/security` first.

### (e) Set the hosted minimum password length to 12

Dashboard → Authentication → Policies (or Providers → Email) → minimum password
length → **12**, matching `supabase/config.toml`. Leave the requirements
selector at its "no additional requirements" setting, per (c).

### (f) Enable Confirm Email

Dashboard → Authentication → Providers → Email → **Confirm email**. `signUp`
already handles the no-session-yet case and returns the "check your email"
message, so this needs no code change.

### (g) Enable leaked-password protection, if the plan offers it

Dashboard → Authentication → Policies → **leaked password protection**. This is
Supabase's own HIBP integration and is complementary to Task 2's check, not a
replacement: ours screens on our side and fails open, theirs enforces at the
Auth API. Enabling it does not surface raw error strings for the flows we
control — `actions.ts` never returns `error.message` to the client, full
stop, regardless of which check rejected the password. (There is no
client-side breach check to credit for this: `password-breach.js` is
server-only, and it fails open, so during an HIBP outage Supabase's own
protection can reject a password that ours already passed.) The real residual
is weaker copy, not a leaked string: the user sees the generic `signUpFailed`
message with no hint that the specific reason was a breached password.

### (h) REQUIRED IN EVERY ENVIRONMENT — `SUPABASE_SERVICE_ROLE_KEY` must be present and valid, or authentication fails closed with no other symptom

Before this branch, `apps/web/src/lib/env.ts` required only
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the
service-role key was needed only for storage/portal/notifications/Stripe
paths, so an environment missing it could still sign users in. That is no
longer true: `checkRateLimit` (`apps/web/src/lib/rate-limit.ts`) calls
`createAdminClient()`, which throws synchronously if
`SUPABASE_SERVICE_ROLE_KEY` is unset, and `enforceAuthRateLimit` runs on every
sign-in, signup, magic-link and password-reset-request Server Action **before**
the Supabase call. That throw is caught and treated as fail-closed (correct —
see the module header), so the result is not a crash but a normal-looking
denial.

**The symptom an operator or user will actually report is "Too many
attempts."** There is no other error surfaced anywhere in the UI. The only
server-side signal is a `rate_limit_client_error` log line — no message text,
no stack, by design (see `rate-limit.ts`'s comment on why nothing more
specific is logged). An environment with a missing, empty, or
rotated-but-not-redeployed `SUPABASE_SERVICE_ROLE_KEY` therefore has **no
working authentication at all**, and it is indistinguishable, from the
outside, from "someone is actually being rate-limited."

If users report being permanently rate-limited — every attempt, every account,
immediately — **check `SUPABASE_SERVICE_ROLE_KEY` in that environment first**,
before investigating the rate-limit store itself. This is exactly the class of
drift a preview deployment with divergent env is prone to — see
[DEPLOYMENT_SECURITY_CHECKLIST.md](DEPLOYMENT_SECURITY_CHECKLIST.md)'s Preview
Deployments section, which carries the matching checklist item.

---

## 4. Verification after deployment

1. Sign in as a user with **no** factor → normal access, no redirects.
2. Enroll a factor at `/settings/security`, sign out, sign back in → the
   password step is followed by `/login/mfa`; a correct code lands you on the
   page you originally requested.
3. As a platform admin with no factor, open `/admin` → you land on
   `/settings/security` **once**, and the page renders. If the browser reports
   too many redirects, stop and treat it as a release blocker.
4. As a platform admin at AAL2, open `/admin` → renders directly, with no extra
   round trip on subsequent dashboard navigation.
5. Confirm the sign-out control on `/login/mfa` works without a code.
