"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type OnboardingState = { error?: string };

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
    owner_full_name: fullName || metadataName || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/");
}
