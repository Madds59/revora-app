"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

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
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect("/");
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const accountIntent = parseAccountIntent(formData.get("account_intent"));
  if (!email || !password) return { error: "Email and password are required." };
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };
  if (!accountIntent) return { error: "Choose an account type to continue." };

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
    return { message: "Check your email to confirm your account, then sign in." };

  redirect(accountIntent === "customer" ? "/portal" : "/onboarding");
}

export async function signInWithMagicLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Email is required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: await callbackUrl("/") },
  });
  if (error) return { error: error.message };

  return { message: "Magic link sent. Check your email to sign in." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
