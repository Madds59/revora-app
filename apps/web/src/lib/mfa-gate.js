// Pure MFA routing decision for the middleware (APPSEC-10 auth hardening, Task 7).
//
// Authored as .js (ESM), like lib/validation/mfa.js and lib/locale-path.js, so
// the decision that middleware enforces can be exercised directly under plain
// `node --test tests/*.test.mjs` — no Next.js runtime, no request object, no
// live Supabase project. Nothing here imports a framework: every input is a
// plain value the caller has already resolved.
//
// WHY THIS EXTRACTION EXISTS AT ALL: `mfaRedirectFor` decides whether to issue
// a REDIRECT from middleware, which runs on nearly every request. A gate that
// redirects to a path the gate itself also redirects away from is an infinite
// loop that takes the whole application down, and an infinite loop is invisible
// to conventional unit tests unless somebody writes the test that looks for it.
// Keeping the decision pure is what makes "feed the gate its own answer and
// assert it now says null" a one-line test (see tests/mfa-gate.test.mjs).

/** Where a session that has a verified factor but has not used it is sent. */
export const MFA_CHALLENGE_PATH = "/login/mfa";

/**
 * Where a platform admin with NO verified factor is sent, i.e. enrollment.
 * A platform admin missing a second factor is never locked out — they are
 * routed to set one up. See `mfaRedirectFor` for why this is scoped to /admin.
 */
export const MFA_ENROLLMENT_PATH = "/settings/security";

/**
 * Supabase's auth callback routes (code exchange, email confirmation, recovery
 * links). Gating these would break the very flow that establishes the session
 * the gate then inspects.
 */
const AUTH_CALLBACK_PREFIX = "/auth";

/** The platform admin area the AAL2 requirement is scoped to. */
const ADMIN_PREFIX = "/admin";

/**
 * True when `path` is `base` itself or a descendant of it. Compares whole
 * segments, so "/administration" is NOT under "/admin".
 *
 * @param {string} path - de-localized path, e.g. "/admin/tenants".
 * @param {string} base
 * @returns {boolean}
 */
function isWithin(path, base) {
  return path === base || path.startsWith(`${base}/`);
}

/**
 * Decides whether a request must be redirected to satisfy the MFA policy.
 *
 * All inputs are already-resolved plain values; `path` is the DE-LOCALIZED
 * path (no `/en` or `/ar` prefix) — the caller re-applies the locale prefix to
 * whatever this returns.
 *
 * Rules, in the order they are evaluated:
 *
 *   1. `/auth/*` is never gated (see AUTH_CALLBACK_PREFIX).
 *   2. `currentLevel === "aal1" && nextLevel === "aal2"` — the session has a
 *      verified factor available but has not satisfied it — → challenge.
 *      This applies to EVERY user, not just admins: once you have enrolled a
 *      second factor, your session is expected to use it.
 *   3. Under `/admin` only, `isSuperAdmin && !hasVerifiedFactor` → enrollment.
 *      Checked BEFORE rule 4 on purpose: an admin with no factor cannot
 *      possibly pass a challenge, so sending them to the challenge page would
 *      strand them. They go to enrollment instead.
 *   4. Under `/admin` only, `isSuperAdmin && currentLevel !== "aal2"` →
 *      challenge. Platform admins must be AAL2 to reach the admin area.
 *   5. Otherwise no redirect.
 *
 * Rules 3 and 4 are SCOPED TO `/admin` deliberately (brief amendment
 * 2026-08-22). The control being bought is "MFA is required to reach the
 * platform admin area", and scoping buys exactly that: an admin's non-admin
 * access is governed by the same session either way, so firing globally adds
 * no security. What firing globally WOULD add is a total-lockout failure mode:
 * `supabase/config.toml` configures only the local CLI stack, so if the hosted
 * project has TOTP disabled in its dashboard, enrollment cannot succeed, and a
 * global rule would bounce every platform admin out of the entire product.
 * Scoped, that same misconfiguration costs admins only `/admin`.
 *
 * LOOP SAFETY: whatever the rules above produce is discarded when the request
 * is already at (or inside) that destination. Redirecting a request to the
 * page it is already on is an infinite loop, and it is the ONLY way this
 * function can take the application down, so the guard is applied uniformly at
 * the end rather than being spelled out inside each rule.
 *
 * @param {object} input
 * @param {string | null | undefined} input.currentLevel - AAL of this session
 *   ("aal1" | "aal2"), from `getAuthenticatorAssuranceLevel()`.
 * @param {string | null | undefined} input.nextLevel - highest AAL this user
 *   could reach; "aal2" only when a VERIFIED factor exists.
 * @param {boolean} input.isSuperAdmin - membership of `platform_admins`.
 * @param {boolean} input.hasVerifiedFactor - whether a VERIFIED factor exists.
 *   Unverified/abandoned enrollments must never count towards this.
 * @param {string} input.path - de-localized request path.
 * @returns {string | null} `MFA_CHALLENGE_PATH`, `MFA_ENROLLMENT_PATH`, or null.
 */
export function mfaRedirectFor({
  currentLevel,
  nextLevel,
  isSuperAdmin,
  hasVerifiedFactor,
  path,
}) {
  if (typeof path !== "string" || !path.startsWith("/")) return null;
  if (isWithin(path, AUTH_CALLBACK_PREFIX)) return null;

  const target = intendedTarget({
    currentLevel,
    nextLevel,
    isSuperAdmin,
    hasVerifiedFactor,
    path,
  });
  if (target === null) return null;

  // The loop guard. See the note above: a redirect to where we already are
  // (or to an ancestor of where we already are) never terminates.
  if (isWithin(path, target)) return null;

  return target;
}

/**
 * Rules 2-5 above, without the loop guard. Split out only so the guard cannot
 * be accidentally bypassed by a future rule that returns early.
 *
 * @returns {string | null}
 */
function intendedTarget({
  currentLevel,
  nextLevel,
  isSuperAdmin,
  hasVerifiedFactor,
  path,
}) {
  if (currentLevel === "aal1" && nextLevel === "aal2") {
    return MFA_CHALLENGE_PATH;
  }

  if (isSuperAdmin && isWithin(path, ADMIN_PREFIX)) {
    if (!hasVerifiedFactor) return MFA_ENROLLMENT_PATH;
    if (currentLevel !== "aal2") return MFA_CHALLENGE_PATH;
  }

  return null;
}

/**
 * Sanitizes the `?next=` value the challenge page returns a user to after a
 * successful code.
 *
 * The middleware only ever writes a de-localized path it derived from the
 * request itself, so in practice this is always internal — but the value
 * arrives back as an attacker-controllable query parameter, and a redirect
 * target read from a query parameter is an open redirect unless it is
 * validated. Anything that is not an unambiguously-internal absolute path
 * (including protocol-relative "//evil.example", backslash variants which some
 * browsers normalize to "/", and anything carrying a query or fragment)
 * collapses to "/".
 *
 * @param {unknown} value
 * @returns {string} a path beginning with a single "/".
 */
export function safeReturnPath(value) {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  if (!/^\/[A-Za-z0-9\-._~/]*$/.test(value)) return "/";
  // Never bounce the user straight back to the challenge page they just passed.
  if (isWithin(value, MFA_CHALLENGE_PATH)) return "/";
  return value;
}
