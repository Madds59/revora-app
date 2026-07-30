"use server";

import { revalidatePath } from "next/cache";

import { requireMembership } from "@/lib/auth";
import { canManageBusiness, canManageSettings } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { firstValidationMessage } from "@/lib/validation/common";
import {
  addBranchSchema,
  addServiceSchema,
  updateBusinessSchema,
} from "@/lib/validation/business-settings";

export type FormState = { error?: string; message?: string };

export async function updateBusiness(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageBusiness(member.role))
    return { error: "Only owners can edit business details." };

  const parsed = updateBusinessSchema.safeParse({
    name: formData.get("name"),
    legalName: formData.get("legal_name"),
    tagline: formData.get("tagline"),
    country: formData.get("country"),
    defaultLanguage: formData.get("default_language"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      name: v.name,
      legal_name: v.legalName ?? null,
      tagline: v.tagline ?? null,
      country: v.country,
      default_language: v.defaultLanguage,
    })
    // Target business is session-derived, never client-supplied.
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

  const parsed = addBranchSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("branches").insert({
    business_id: business.id,
    name: v.name,
    phone: v.phone ?? null,
    email: v.email ?? null,
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

  const parsed = addServiceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    defaultPrice: formData.get("default_price"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("services").insert({
    business_id: business.id,
    name: v.name,
    description: v.description ?? null,
    // Blank stays blank (null), preserving the column's nullable semantics.
    default_price: v.defaultPrice ?? null,
  });
  if (error) {
    console.error("addService failed", error);
    return { error: "Could not add service. Please try again." };
  }

  revalidatePath("/settings/business");
  return { message: "Service added." };
}
