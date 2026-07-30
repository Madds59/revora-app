"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getUser, requireMembership } from "@/lib/auth";
import { canManageCustomers } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { firstValidationMessage } from "@/lib/validation/common";
import {
  createCustomerSchema,
  updateCustomerSchema,
} from "@/lib/validation/customers";
import { createVehicle } from "../vehicles/actions";

export type FormState = { error?: string; message?: string };

// Non-enumerating response: a member must not be able to tell "no such
// customer" apart from "belongs to another business" (APPSEC-09 Phase 3).
const CUSTOMER_UNAVAILABLE = "Customer not found or unavailable.";

export async function createCustomer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageCustomers(member.role))
    return { error: "You don't have permission to add customers." };

  const parsed = createCustomerSchema.safeParse({
    fullName: formData.get("full_name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    preferredLanguage: formData.get("preferred_language"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const user = await getUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      // Tenant + author identity are session-derived, never client input.
      business_id: business.id,
      full_name: v.fullName,
      phone: v.phone ?? null,
      email: v.email ?? null,
      preferred_language: v.preferredLanguage as string,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error) console.error("createCustomer failed", error);
    return { error: "Could not create customer." };
  }

  revalidatePath("/customers");
  redirect(`/customers/${data.id}`);
}

export async function updateCustomer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageCustomers(member.role))
    return { error: "You don't have permission to edit customers." };

  const parsed = updateCustomerSchema.safeParse({
    id: formData.get("id"),
    fullName: formData.get("full_name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    preferredLanguage: formData.get("preferred_language"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  // Explicit tenant scoping in addition to RLS: the update is constrained to
  // the session's business, so a valid id from another tenant matches nothing.
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("customers")
    .update({
      full_name: v.fullName,
      phone: v.phone ?? null,
      email: v.email ?? null,
      preferred_language: v.preferredLanguage as string,
    })
    .eq("id", v.id)
    .eq("business_id", business.id)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("updateCustomer failed", error);
    return { error: "Could not update customer." };
  }
  if (!updated) return { error: CUSTOMER_UNAVAILABLE };

  revalidatePath(`/customers/${v.id}`);
  return { message: "Customer updated." };
}

export async function addVehicle(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await createVehicle(_prev, formData);
  if (result.message) return { message: result.message };
  return result;
}
