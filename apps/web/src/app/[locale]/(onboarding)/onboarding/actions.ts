"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { isAccountIntent, type AccountIntent } from "@/lib/account-intent";
import { getCurrentAccountIntent, getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type OnboardingState = { error?: string; message?: string };

function parseAccountIntent(value: FormDataEntryValue | null): AccountIntent | null {
  if (typeof value !== "string") return null;
  return isAccountIntent(value) ? value : null;
}

export async function saveOnboardingIntent(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const user = await getUser();
  if (!user) redirect("/login");

  const accountIntent = parseAccountIntent(formData.get("account_intent"));
  if (!accountIntent) return { error: "Choose an account type to continue." };

  const supabase = await createClient();

  const [{ error: profileError }, { error: authError }] = await Promise.all([
    supabase
      .from("profiles")
      .upsert(
        { id: user.id, account_intent: accountIntent },
        { onConflict: "id" },
      ),
    supabase.auth.updateUser({
      data: { account_intent: accountIntent },
    }),
  ]);

  if (profileError) return { error: profileError.message };
  if (authError) return { error: authError.message };

  revalidatePath("/", "layout");
  if (accountIntent === "customer") redirect("/portal");
  redirect("/onboarding");
}

/**
 * Creates the caller's business and registers them as its owner.
 *
 * Goes through the `create_business` SECURITY DEFINER RPC
 * (supabase/migrations/0004_onboarding_rpc.sql) rather than raw table inserts:
 * the initial owner can't be bootstrapped through table RLS alone, because the
 * membership-insert policy must read back the just-created business before the
 * creator is a member. The RPC creates profile + business + owner membership
 * atomically.
 */
export async function createBusiness(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const user = await getUser();
  if (!user) redirect("/login");
  const intent = await getCurrentAccountIntent();
  if (intent === "customer" || intent === "staff_invited") {
    return {
      error:
        "This account is set up for customer or invited staff access. Choose a business owner account to create a workspace.",
    };
  }

  const name = String(formData.get("name") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!name) return { error: "Business name is required." };

  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_business", {
    business_name: name,
    owner_full_name: fullName || metadataName || undefined,
  });
  if (error) return { error: error.message };

  await Promise.all([
    supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          account_intent: "business_owner",
          onboarding_completed_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      ),
    supabase.auth.updateUser({
      data: { account_intent: "business_owner" },
    }),
  ]);

  revalidatePath("/", "layout");
  redirect("/");
}
