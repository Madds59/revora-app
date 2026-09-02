"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  challengeOrVerifyErrorKey,
  enrollErrorKey,
  enrollTotpFactor,
  unenrollErrorKey,
  unenrollFactorWithFreshCode,
  verifyTotpEnrollment,
} from "@/lib/validation/mfa";

// Server Actions for TOTP MFA enrollment/challenge (APPSEC-10 Task 6). This
// file is the ONLY place the ordering rules in lib/validation/mfa.js get
// wired to a real Supabase client — everything below follows the shape of
// the existing auth Server Actions (`(auth)/actions.ts`): every action starts
// with `requireUser()`, returns the project's `{ error?, message? }` state
// shape for `useActionState`, and only ever surfaces curated, non-enumerating
// copy — raw `error.message` is never returned, only `error.code` is logged.
//
// Task 7 (not this task) adds the middleware AAL gate that actually ENFORCES
// a verified factor on sensitive routes. This file only lets a user
// enroll/verify/unenroll one — it does not change what any route requires.

export type MfaActionState = { error?: string; message?: string };

/**
 * `startEnrollment`'s state additionally carries the one-time enrollment
 * payload the client needs to render the QR code and manual secret. Nothing
 * else in this file ever returns `secret` — see the module header on
 * lib/validation/mfa.js for why that matters.
 */
export type StartEnrollmentState = MfaActionState & {
  factorId?: string;
  qrCode?: string;
  secret?: string;
};

// Takes no arguments: `useActionState` always calls its action with
// `(prevState, formData)`, but this action needs neither — the enrolled
// factor's friendly name is fixed (lib/validation/mfa.js), and there is no
// user input for "start enrollment". A function with fewer declared
// parameters is call-compatible with `useActionState`'s expected signature
// (the same reason `(auth)/actions.ts`'s zero-arg `signOut` works bound
// directly to a `<form action={...}>`).
export async function startEnrollment(): Promise<StartEnrollmentState> {
  await requireUser();
  const t = await getTranslations("settings.security.actions");
  const supabase = await createClient();

  const result = await enrollTotpFactor(supabase.auth.mfa);
  if (!result.ok) {
    console.error("mfa_enroll_error", result.code);
    return { error: t(enrollErrorKey(result.code)) };
  }

  return { factorId: result.factorId, qrCode: result.qrCode, secret: result.secret };
}

export async function verifyEnrollment(
  _prev: MfaActionState,
  formData: FormData,
): Promise<MfaActionState> {
  await requireUser();
  const t = await getTranslations("settings.security.actions");
  const factorId = String(formData.get("factor_id") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  if (!factorId || !code) return { error: t("codeRequired") };

  const supabase = await createClient();
  const result = await verifyTotpEnrollment(supabase.auth.mfa, { factorId, code });
  if (!result.ok) {
    console.error("mfa_verify_error", result.code);
    return { error: t(challengeOrVerifyErrorKey(result.code)) };
  }

  revalidatePath("/settings/security");
  return { message: t("enrolled") };
}

export async function unenrollFactor(
  _prev: MfaActionState,
  formData: FormData,
): Promise<MfaActionState> {
  await requireUser();
  const t = await getTranslations("settings.security.actions");
  const factorId = String(formData.get("factor_id") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  if (!factorId || !code) return { error: t("codeRequired") };

  const supabase = await createClient();
  // Requires a FRESH valid code via challenge+verify before it will even
  // attempt mfa.unenroll — see lib/validation/mfa.js. Removing a second
  // factor is a privilege reduction and must itself be authenticated.
  const result = await unenrollFactorWithFreshCode(supabase.auth.mfa, { factorId, code });
  if (!result.ok) {
    console.error("mfa_unenroll_error", result.code);
    return { error: t(unenrollErrorKey(result)) };
  }

  revalidatePath("/settings/security");
  return { message: t("removed") };
}
