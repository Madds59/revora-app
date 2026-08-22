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
import { createClient } from "@/lib/supabase/server";
import { firstValidationMessage, passwordSchema } from "@/lib/validation/password";

export type AuthState = { error?: string; message?: string };

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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

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
  if (error) return { error: error.message };

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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: await callbackUrl("/") },
  });
  if (error) return { error: error.message };

  return { message: t("magicLinkSent") };
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

  const supabase = await createClient();
  const locale = (await getLocale()) as "en" | "ar";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await callbackUrl(buildResetPasswordPath(locale)),
  });
  if (error) return { error: error.message };

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
  if (error) return { error: error.message };

  const locale = (await getLocale()) as "en" | "ar";
  await supabase.auth.signOut();
  redirect(`${buildLoginPath(locale)}?reset=success`);
}
