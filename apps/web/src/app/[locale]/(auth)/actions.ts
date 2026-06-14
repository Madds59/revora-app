"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { isAccountIntent, type AccountIntent } from "@/lib/account-intent";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

function parseAccountIntent(value: string | FormDataEntryValue | null): AccountIntent | null {
  if (typeof value !== "string") return null;
  return isAccountIntent(value) ? value : null;
}

async function callbackUrl(nextPath = "/") {
  const origin = (await headers()).get("origin") ?? "";
  return `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
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
  if (password.length < 8) return { error: t("passwordMin") };
  if (!accountIntent) return { error: t("chooseAccountType") };

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
  await supabase.auth.signOut();
  redirect("/login");
}
