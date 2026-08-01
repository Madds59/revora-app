"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { type AccountIntent } from "@/lib/account-intent";
import { getCurrentAccountIntent, getCurrentMembership, getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createBusinessSchema,
  firstValidationMessage,
  onboardingIntentSchema,
} from "@/lib/validation/onboarding";

export type OnboardingState = { error?: string; message?: string };

/**
 * Records the caller's onboarding routing preference.
 *
 * `account_intent` is UX state only — it never grants tenant ownership, staff
 * membership or platform-admin authority (APPSEC-02). The row written is keyed
 * on the **session** user id, so a caller cannot set another user's intent.
 */
export async function saveOnboardingIntent(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const user = await getUser();
  if (!user) redirect("/login");

  const parsed = onboardingIntentSchema.safeParse({
    accountIntent: formData.get("account_intent"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const accountIntent = parsed.data.accountIntent as AccountIntent;

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

  if (profileError) {
    console.error("saveOnboardingIntent failed", profileError.code);
    return { error: "Could not save your account type. Please try again." };
  }
  if (authError) {
    // Never surface the provider's own message (APPSEC-07): it can echo the
    // address or account state back to the caller.
    console.error("saveOnboardingIntent auth update failed", authError.status);
    return { error: "Could not save your account type. Please try again." };
  }

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

  // Already onboarded: the onboarding page redirects members away, and this
  // guard makes the action enforce the same rule, so a repeated or directly
  // invoked submission cannot create a second business and owner membership.
  const existingMembership = await getCurrentMembership();
  if (existingMembership) redirect("/");

  const parsed = createBusinessSchema.safeParse({
    name: formData.get("name"),
    fullName: formData.get("full_name"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };

  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : null;

  const supabase = await createClient();
  // Owner identity is NOT passed: `create_business` is SECURITY DEFINER and
  // derives the owner from auth.uid(), generates the business id server-side and
  // hard-codes the initial role to 'business_owner'.
  const { error } = await supabase.rpc("create_business", {
    business_name: parsed.data.name,
    owner_full_name: parsed.data.fullName || metadataName || undefined,
  });
  if (error) {
    console.error("createBusiness failed", error.code);
    return { error: "Could not create your business. Please try again." };
  }

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
