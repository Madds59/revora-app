"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getUser, requireMembership } from "@/lib/auth";
import { canManageCustomers } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { createVehicle } from "../vehicles/actions";

export type FormState = { error?: string; message?: string };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  const value = str(formData, key);
  return value === "" ? null : value;
}

export async function createCustomer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageCustomers(member.role))
    return { error: "You don't have permission to add customers." };

  const user = await getUser();
  const fullName = str(formData, "full_name");
  if (!fullName) return { error: "Customer name is required." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      business_id: business.id,
      full_name: fullName,
      phone: optional(formData, "phone"),
      email: optional(formData, "email"),
      preferred_language: str(formData, "preferred_language") || "en",
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create customer." };

  revalidatePath("/customers");
  redirect(`/customers/${data.id}`);
}

export async function updateCustomer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member } = await requireMembership();
  if (!canManageCustomers(member.role))
    return { error: "You don't have permission to edit customers." };

  const id = str(formData, "id");
  const fullName = str(formData, "full_name");
  if (!id) return { error: "Missing customer id." };
  if (!fullName) return { error: "Customer name is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({
      full_name: fullName,
      phone: optional(formData, "phone"),
      email: optional(formData, "email"),
      preferred_language: str(formData, "preferred_language") || "en",
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/customers/${id}`);
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
