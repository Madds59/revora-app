// Pure TOTP MFA orchestration logic (APPSEC-10 auth hardening, Task 6).
//
// Authored as .js (ESM), like lib/validation/password.js and
// lib/validation/rate-limit-key.js, so it can be unit-tested offline with
// `node --test tests/*.test.mjs` — no Next.js runtime, no network, no live
// Supabase project. Every function here takes a `mfa` client as a plain
// parameter (mirroring the shape of `supabase.auth.mfa`, i.e. GoTrue's
// `enroll`/`challenge`/`verify`/`unenroll`/`listFactors`) via dependency
// injection, the same inversion-of-control trick `clientIpFrom` uses for
// `headerGetter`. In production the caller (the "use server" actions file)
// passes the real `supabase.auth.mfa`; tests pass a stub that records calls.
//
// SECURITY-CRITICAL PROPERTIES enforced by this module (see task-6-brief.md):
//   1. `enroll()` creates an UNVERIFIED factor immediately. A user who
//      abandons enrollment leaves that factor behind; `enrollTotpFactor`
//      recovers from that by unenrolling a STALE UNVERIFIED factor sharing
//      our friendly name before retrying — but it must never touch a
//      VERIFIED factor found under the same name, since that would silently
//      strip a user's real second factor.
//   2. A factor only counts as "enabled" once `verify()` succeeds — nothing
//      here ever reports an unverified factor as protection.
//   3. `unenrollFactorWithFreshCode` must NEVER be able to reach
//      `mfa.unenroll` without a successful `challenge()` + `verify()`
//      immediately before it — removing a second factor is a privilege
//      reduction and must itself be authenticated with a fresh code (a code
//      accepted for an earlier action, e.g. login, must not be reusable
//      here). The control flow below returns eagerly on any challenge/verify
//      failure, so `mfa.unenroll` is only ever reached after `verified.ok`.
//   4. Never log or return the TOTP secret beyond the single enrollment
//      response the caller must relay to the user once.

// Fixed, non-localized friendly name used for every TOTP enrollment this app
// creates. Keeping it CONSTANT (never derived from user input or locale) is
// what makes the recovery path in `enrollTotpFactor` deterministic: Supabase
// only errors with `mfa_factor_name_conflict` when the *same* friendly name
// is reused, so a second enrollment attempt after an abandoned first one is
// guaranteed to collide with (and let us find) the earlier attempt's factor,
// regardless of which locale the user was on when they started either time.
export const TOTP_FRIENDLY_NAME = "revora-authenticator";

/**
 * Calls `mfa.enroll({ factorType: "totp", ... })` and normalizes the result.
 * Never touches `listFactors`/`unenroll` — that recovery step lives in
 * `enrollTotpFactor`, which calls this at most twice.
 */
async function attemptEnroll(mfa) {
  const { data, error } = await mfa.enroll({
    factorType: "totp",
    friendlyName: TOTP_FRIENDLY_NAME,
  });
  if (error || !data) {
    return { ok: false, code: error?.code ?? "unknown" };
  }
  return {
    ok: true,
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

/**
 * Starts (or resumes) TOTP enrollment for the current user.
 *
 * Happy path: a single `enroll()` call succeeds and its `{ factorId, qrCode,
 * secret }` is returned.
 *
 * Recovery path: `enroll()` fails with `mfa_factor_name_conflict` (our fixed
 * friendly name is already taken). We list factors to find out why:
 *   - If a VERIFIED totp factor already holds that name, the user already
 *     has MFA enabled; we report `{ ok: false, code: "already_enrolled" }`
 *     (a synthetic code, not from Supabase) and unenroll nothing.
 *   - Otherwise any UNVERIFIED totp factor(s) holding that name are stale
 *     leftovers from an abandoned attempt; each is unenrolled, then `enroll`
 *     is retried exactly once (never looped) and that result is returned.
 *
 * @param {object} mfa - `supabase.auth.mfa` or a stub with the same shape.
 * @returns {Promise<
 *   | { ok: true, factorId: string, qrCode: string, secret: string }
 *   | { ok: false, code: string }
 * >}
 */
export async function enrollTotpFactor(mfa) {
  const first = await attemptEnroll(mfa);
  if (first.ok || first.code !== "mfa_factor_name_conflict") {
    return first;
  }

  const listed = await mfa.listFactors();
  if (listed.error || !listed.data) {
    return { ok: false, code: listed.error?.code ?? "unknown" };
  }

  const matching = listed.data.all.filter(
    (factor) =>
      factor.factor_type === "totp" && factor.friendly_name === TOTP_FRIENDLY_NAME,
  );

  if (matching.some((factor) => factor.status === "verified")) {
    return { ok: false, code: "already_enrolled" };
  }

  for (const factor of matching) {
    const result = await mfa.unenroll({ factorId: factor.id });
    if (result.error) {
      return { ok: false, code: result.error?.code ?? "unknown" };
    }
  }

  return attemptEnroll(mfa);
}

/**
 * `mfa.challenge()` then `mfa.verify()` for `factorId`/`code`. Shared by
 * `verifyTotpEnrollment` (activating a freshly-enrolled factor) and
 * `unenrollFactorWithFreshCode` (authenticating a removal) — both need
 * exactly this "prove you have a current code" step and nothing more.
 *
 * @returns {Promise<
 *   | { ok: true }
 *   | { ok: false, code: string, stage: "challenge" | "verify" }
 * >}
 */
async function challengeThenVerify(mfa, { factorId, code }) {
  const challenge = await mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) {
    return { ok: false, code: challenge.error?.code ?? "unknown", stage: "challenge" };
  }

  const verify = await mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verify.error) {
    return { ok: false, code: verify.error?.code ?? "unknown", stage: "verify" };
  }

  return { ok: true };
}

/**
 * Activates a freshly-enrolled TOTP factor: the user must prove they can
 * generate a current code before the factor counts as protection.
 *
 * @returns {ReturnType<typeof challengeThenVerify>}
 */
export async function verifyTotpEnrollment(mfa, { factorId, code }) {
  return challengeThenVerify(mfa, { factorId, code });
}

/**
 * Removes an already-verified TOTP factor, but ONLY after a fresh
 * challenge+verify succeeds. `mfa.unenroll` is structurally unreachable here
 * unless `challengeThenVerify` returned `{ ok: true }` — see the early
 * `return verified` below.
 *
 * @returns {Promise<
 *   | { ok: true }
 *   | { ok: false, code: string, stage: "challenge" | "verify" | "unenroll" }
 * >}
 */
export async function unenrollFactorWithFreshCode(mfa, { factorId, code }) {
  const verified = await challengeThenVerify(mfa, { factorId, code });
  if (!verified.ok) return verified;

  const result = await mfa.unenroll({ factorId });
  if (result.error) {
    return { ok: false, code: result.error?.code ?? "unknown", stage: "unenroll" };
  }

  return { ok: true };
}

// --- curated error -> i18n MESSAGE KEY mapping (Task 6 review round 1) -----
//
// These three functions decide which curated copy a failure surfaces as —
// including the security-critical NON-ENUMERATION property: a wrong code,
// an unknown/expired factor id, and a rejected challenge must all resolve
// to the SAME key, or the failure path leaks whether a given factor exists.
// They live here (locale-free, like the rest of this module) rather than in
// `(dashboard)/settings/security/actions.ts` specifically so this property
// can be asserted BEHAVIOURALLY offline, under plain `node --test` — see
// tests/mfa-enrollment.test.mjs. Each returns an i18n key, never a
// translated string; the "use server" caller resolves it via
// `getTranslations("settings.security.actions")`.

/**
 * Maps an `enrollTotpFactor()` failure code to a curated message key.
 *
 * `"already_enrolled"` is OUR synthetic code (see `enrollTotpFactor` above).
 * `"mfa_verified_factor_exists"` is a real GoTrue `ErrorCode` (alongside
 * `"mfa_factor_name_conflict"`, which `enrollTotpFactor` already handles) for
 * the same underlying situation — some GoTrue versions may report a verified
 * factor's presence this way instead. Both mean the same thing to a user
 * ("you already have this enabled") and are safe to say plainly: they
 * describe the caller's OWN account state, not another account's existence.
 * Everything else collapses to the generic `"enrollFailed"` key.
 *
 * @param {string} code
 * @returns {"alreadyEnrolled" | "enrollFailed"}
 */
export function enrollErrorKey(code) {
  if (code === "already_enrolled" || code === "mfa_verified_factor_exists") {
    return "alreadyEnrolled";
  }
  return "enrollFailed";
}

/**
 * Maps a challenge/verify failure code — from `verifyTotpEnrollment` or the
 * challenge+verify prefix of `unenrollFactorWithFreshCode` — to a curated
 * message key.
 *
 * NON-ENUMERATION IS THE POINT: `"mfa_verification_failed"` (wrong code) and
 * `"mfa_factor_not_found"` (unknown/expired factor id) — and any other
 * challenge/verify failure code not explicitly listed below — all resolve to
 * the SAME `"invalidCode"` key on purpose. Distinguishing them in the UI
 * would let an attacker probe whether a given factor id exists.
 *
 * @param {string} code
 * @returns {"tooManyAttempts" | "codeExpired" | "invalidCode"}
 */
export function challengeOrVerifyErrorKey(code) {
  if (code === "over_request_rate_limit" || code === "over_sms_send_rate_limit") {
    return "tooManyAttempts";
  }
  if (code === "mfa_challenge_expired") return "codeExpired";
  return "invalidCode";
}

/**
 * Maps an `unenrollFactorWithFreshCode()` failure result to a curated
 * message key. A failure at `stage: "unenroll"` (the code WAS accepted, but
 * the removal call itself then failed) is reported distinctly from a
 * rejected/expired code via `"removeFailed"` — conflating the two would
 * wrongly tell a user who typed the correct code that their code was wrong.
 * Every other stage (`"challenge"` / `"verify"`) delegates to
 * `challengeOrVerifyErrorKey`, inheriting the same non-enumeration property.
 *
 * @param {{ code: string, stage: "challenge" | "verify" | "unenroll" }} failure
 * @returns {"removeFailed" | "tooManyAttempts" | "codeExpired" | "invalidCode"}
 */
export function unenrollErrorKey(failure) {
  if (failure.stage === "unenroll") return "removeFailed";
  return challengeOrVerifyErrorKey(failure.code);
}
