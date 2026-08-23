"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { isAccountIntent, type AccountIntent } from "@/lib/account-intent";
import {
  buildLoginPath,
  buildResetPasswordPath,
} from "@/lib/auth-links";
// SERVER-ONLY (imports node:crypto). Never import this into a client
// component — see the module header for the full fail-open contract.
import { isPasswordBreached } from "@/lib/password-breach";
// SERVER-ONLY (transitively imports lib/supabase/admin.ts, which holds the
// service-role key). Never import this into a client component. See the
// module header for the fail-CLOSED contract — the opposite of
// password-breach.ts above, and deliberately so.
import { enforceAuthRateLimit } from "@/lib/rate-limit";
import { switchLocalePath } from "@/lib/locale-path";
import { safeReturnPath } from "@/lib/mfa-gate";
import { createClient } from "@/lib/supabase/server";
import { clientIpFrom } from "@/lib/validation/rate-limit-key";
import {
  challengeOrVerifyErrorKey,
  challengeThenVerify,
} from "@/lib/validation/mfa";
import { firstValidationMessage, passwordSchema } from "@/lib/validation/password";

export type AuthState = { error?: string; message?: string };

/**
 * Best-effort client IP for rate-limit bucket keys. `clientIpFrom` (see its
 * module header) never returns null — a request with no usable IP header is
 * bucketed under the literal string "unknown" rather than being exempted
 * from limiting.
 */
async function clientIp(): Promise<string> {
  const headerList = await headers();
  return clientIpFrom((name) => headerList.get(name));
}

function parseAccountIntent(value: string | FormDataEntryValue | null): AccountIntent | null {
  if (typeof value !== "string") return null;
  return isAccountIntent(value) ? value : null;
}

async function callbackUrl(nextPath = "/") {
  const origin = (await headers()).get("origin") ?? "";
  return `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}

// `passwordSchema` (lib/validation/password.js) is locale-free BY DESIGN — it
// ships in the client bundle, so it returns stable dot-codes ("password.tooShort",
// "password.tooLong", "password.controlChars", "password.classes",
// "password.email", "password.common", "password.empty"), never English
// prose. This is the one place those codes become user-facing copy, via the
// `auth.password.errors.<code>` message namespace (both en.json and ar.json).
// Any code this doesn't recognise — a typo, or a future schema refine that
// forgot to add a translation — falls back to `auth.password.errors.generic`.
// It must NEVER render a raw code like "password.tooShort" to a user.
const PASSWORD_ERROR_CODES = [
  "empty",
  "tooShort",
  "tooLong",
  "controlChars",
  "classes",
  "email",
  "common",
] as const;

type PasswordErrorKey = (typeof PASSWORD_ERROR_CODES)[number] | "generic";

function isKnownPasswordErrorCode(value: string): value is (typeof PASSWORD_ERROR_CODES)[number] {
  return (PASSWORD_ERROR_CODES as readonly string[]).includes(value);
}

async function passwordErrorMessage(parsed: unknown): Promise<string> {
  const tErrors = await getTranslations("auth.password.errors");
  const code = firstValidationMessage(parsed, "password.generic");
  const suffix = code.startsWith("password.") ? code.slice("password.".length) : "generic";
  const key: PasswordErrorKey = isKnownPasswordErrorCode(suffix) ? suffix : "generic";
  return tErrors(key);
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await getTranslations("auth.actions");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: t("emailRequired") };

  // Dual-key on purpose (see lib/rate-limit.ts): an email-only bucket lets an
  // attacker lock a victim out; an IP-only bucket is beaten by distributing
  // attempts across IPs. Runs BEFORE the Supabase call, and discloses neither
  // remaining quota nor whether the account exists.
  const allowed = await enforceAuthRateLimit({
    scopes: [
      ["login_ip", await clientIp()],
      ["login_email", email],
    ],
  });
  if (!allowed) return { error: t("tooManyAttempts") };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Curated, non-enumerating message — never error.message (constraint 3).
    // Only the stable SDK error code is logged.
    console.error("auth_sign_in_error", error.code ?? "unknown");
    return { error: t("invalidCredentials") };
  }

  redirect("/");
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await getTranslations("auth.actions");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const accountIntent = parseAccountIntent(formData.get("account_intent"));
  if (!email || !password) return { error: t("emailRequired") };

  // IP-only (no email scope here per the spec): burning through the breach
  // check (a real HIBP network call) and Supabase signup quota is what this
  // guards against, not per-email lockout on an action that doesn't yet
  // authenticate anyone. Runs BEFORE the schema/breach checks and the
  // Supabase call.
  const signUpAllowed = await enforceAuthRateLimit({
    scopes: [["signup_ip", await clientIp()]],
  });
  if (!signUpAllowed) return { error: t("tooManyAttempts") };

  // The canonical policy (APPSEC-10 Task 1). The client-side checklist
  // (PasswordRequirements) is a UX affordance ONLY — this is the sole
  // authority on whether a password is accepted. Do not remove this in favor
  // of the client check; a client component can always be bypassed.
  const parsedPassword = passwordSchema({ email }).safeParse(password);
  if (!parsedPassword.success) {
    return { error: await passwordErrorMessage(parsedPassword) };
  }
  if (!accountIntent) return { error: t("chooseAccountType") };

  // Only reached once the schema above has already rejected malformed input
  // (including an absurdly long password), so this never hashes unbounded
  // attacker-supplied data. `checked: false` means HIBP could not be reached
  // (fail-open, Task 2's deliberate contract) and must proceed as normal —
  // only a confirmed breach (`breached === true` AND `checked === true`)
  // blocks signup.
  const { breached, checked } = await isPasswordBreached(password);
  if (checked && breached) return { error: t("passwordBreached") };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: await callbackUrl(
        accountIntent === "customer" ? "/portal" : "/onboarding",
      ),
      data: { full_name: fullName, account_intent: accountIntent },
    },
  });
  if (error) {
    // Curated, non-enumerating message — never error.message (constraint 3).
    // Only the stable SDK error code is logged.
    console.error("auth_sign_up_error", error.code ?? "unknown");
    return { error: t("signUpFailed") };
  }

  // When email confirmation is enabled, there is no session yet.
  if (!data.session)
    return { message: t("checkEmail") };

  redirect(accountIntent === "customer" ? "/portal" : "/onboarding");
}

export async function signInWithMagicLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await getTranslations("auth.actions");
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: t("emailRequired") };

  // Dual-key: an email bucket for this flow specifically, plus the shared
  // login_ip bucket (this is still an unauthenticated-sign-in path). Runs
  // BEFORE the Supabase call.
  const allowed = await enforceAuthRateLimit({
    scopes: [
      ["magic_link_email", email],
      ["login_ip", await clientIp()],
    ],
  });
  if (!allowed) return { error: t("tooManyAttempts") };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: await callbackUrl("/") },
  });
  if (error) {
    // Curated, non-enumerating message — never error.message (constraint 3).
    // Preserves the existing success-shaped-regardless-of-account-existence
    // property: this path never distinguishes "no such account" from any
    // other failure. Only the stable SDK error code is logged.
    console.error("auth_magic_link_error", error.code ?? "unknown");
    return { error: t("magicLinkFailed") };
  }

  return { message: t("magicLinkSent") };
}

/**
 * Satisfies the second factor for a session that already authenticated with a
 * password but is still at AAL1 (APPSEC-10 Task 7). A successful
 * challenge+verify is what upgrades the session to AAL2, which is the state
 * the middleware gate (lib/mfa-gate.js) reads.
 *
 * The challenge/verify ORDERING is not reimplemented here — it is
 * `challengeThenVerify` from lib/validation/mfa.js, the same code path
 * enrollment and factor-removal use. Likewise the error mapping is
 * `challengeOrVerifyErrorKey`, which deliberately collapses "wrong code",
 * "unknown factor id" and "rejected challenge" onto a single message so the
 * failure cannot be used to probe which factor ids exist.
 *
 * NOT separately rate limited by `enforceAuthRateLimit`: adding a scope means
 * amending 0031's server-side scope allowlist, and re-editing an applied
 * migration in place is the exact hazard AUTH_HARDENING.md's operator actions
 * are about. GoTrue applies its own limits to `mfa.verify`, and its
 * `over_request_rate_limit` code already maps to the `tooManyAttempts` copy
 * below. Recorded as a residual in docs/security/AUTH_HARDENING.md.
 */
export async function verifyMfaChallenge(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await getTranslations("auth.mfa.errors");
  const locale = (await getLocale()) as "en" | "ar";
  const factorId = String(formData.get("factor_id") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  // Sanitized because it round-trips through the browser as a form field.
  // See `safeReturnPath` — anything not unambiguously internal becomes "/".
  const next = safeReturnPath(formData.get("next"));
  if (!factorId || !code) return { error: t("codeRequired") };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(buildLoginPath(locale));

  const result = await challengeThenVerify(supabase.auth.mfa, { factorId, code });
  if (!result.ok) {
    // Curated, non-enumerating message — never error.message (constraint 3).
    // Only the stable SDK error code is logged; never the submitted code.
    console.error("auth_mfa_challenge_error", result.code);
    return { error: t(challengeOrVerifyErrorKey(result.code)) };
  }

  // `next` is de-localized (the middleware wrote it from the de-localized
  // path); re-apply the active locale rather than relying on an extra
  // middleware hop to add the prefix.
  redirect(switchLocalePath(next, locale));
}

export async function signOut() {
  const supabase = await createClient();
  const locale = await getLocale();
  await supabase.auth.signOut();
  redirect(buildLoginPath(locale as "en" | "ar"));
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await getTranslations("auth.actions");
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: t("emailRequired") };

  // Dual-key, same rationale as signIn. Runs BEFORE the Supabase call.
  const allowed = await enforceAuthRateLimit({
    scopes: [
      ["password_reset_ip", await clientIp()],
      ["password_reset_email", email],
    ],
  });
  if (!allowed) return { error: t("tooManyAttempts") };

  const supabase = await createClient();
  const locale = (await getLocale()) as "en" | "ar";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await callbackUrl(buildResetPasswordPath(locale)),
  });
  if (error) {
    // Curated, non-enumerating message — never error.message (constraint 3).
    // Preserves the existing success-shaped-regardless-of-account-existence
    // property: this path never distinguishes "no such account" from any
    // other failure. Only the stable SDK error code is logged.
    console.error("auth_password_reset_error", error.code ?? "unknown");
    return { error: t("passwordResetFailed") };
  }

  return { message: t("passwordResetSent") };
}

export async function updatePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const t = await getTranslations("auth.actions");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  if (!password) return { error: t("passwordRequired") };

  // No email in scope here (see Task 3 brief) — the schema's email-based
  // "not your email" rule is simply skipped. The client-side checklist is a
  // UX affordance ONLY; this is the sole authority on password acceptance.
  const parsedPassword = passwordSchema().safeParse(password);
  if (!parsedPassword.success) {
    return { error: await passwordErrorMessage(parsedPassword) };
  }
  if (password !== confirmPassword) return { error: t("passwordMismatch") };

  // See the identical comment in signUp: schema-then-breach-check ordering
  // means this never hashes unbounded input, and `checked: false` (HIBP
  // unreachable) must fail OPEN, not closed.
  const { breached, checked } = await isPasswordBreached(password);
  if (checked && breached) return { error: t("passwordBreached") };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // Curated, non-enumerating message — never error.message (constraint 3).
    // Only the stable SDK error code is logged.
    console.error("auth_update_password_error", error.code ?? "unknown");
    return { error: t("updatePasswordFailed") };
  }

  const locale = (await getLocale()) as "en" | "ar";
  await supabase.auth.signOut();
  redirect(`${buildLoginPath(locale)}?reset=success`);
}
