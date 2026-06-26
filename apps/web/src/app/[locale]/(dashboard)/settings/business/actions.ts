"use server";

import { revalidatePath } from "next/cache";

import { requireMembership } from "@/lib/auth";
import { canManageBusiness, canManageSettings } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
function optional(formData: FormData, key: string): string | null {
  const value = str(formData, key);
  return value === "" ? null : value;
}

export async function updateBusiness(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageBusiness(member.role))
    return { error: "Only owners can edit business details." };

  const name = str(formData, "name");
  if (!name) return { error: "Business name is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      name,
      legal_name: optional(formData, "legal_name"),
      tagline: optional(formData, "tagline"),
      country: str(formData, "country") || "AE",
      default_language: str(formData, "default_language") || "en",
    })
    .eq("id", business.id);
  if (error) {
    console.error("updateBusiness failed", error);
    return { error: "Could not update business profile. Please try again." };
  }

  revalidatePath("/settings/business");
  revalidatePath("/", "layout");
  return { message: "Business profile updated." };
}

export async function addBranch(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageSettings(member.role))
    return { error: "You don't have permission to manage branches." };

  const name = str(formData, "name");
  if (!name) return { error: "Branch name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("branches").insert({
    business_id: business.id,
    name,
    phone: optional(formData, "phone"),
    email: optional(formData, "email"),
  });
  if (error) {
    console.error("addBranch failed", error);
    return { error: "Could not add branch. Please try again." };
  }

  revalidatePath("/settings/business");
  return { message: "Branch added." };
}

export async function addService(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageSettings(member.role))
    return { error: "You don't have permission to manage services." };

  const name = str(formData, "name");
  if (!name) return { error: "Service name is required." };

  const priceRaw = str(formData, "default_price");
  const price = priceRaw ? Number.parseFloat(priceRaw) : null;
  if (priceRaw && Number.isNaN(price))
    return { error: "Default price must be a number." };

  const supabase = await createClient();
  const { error } = await supabase.from("services").insert({
    business_id: business.id,
    name,
    description: optional(formData, "description"),
    default_price: price,
  });
  if (error) {
    console.error("addService failed", error);
    return { error: "Could not add service. Please try again." };
  }

  revalidatePath("/settings/business");
  return { message: "Service added." };
}
