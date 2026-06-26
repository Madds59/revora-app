"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getUser, requireMembership } from "@/lib/auth";
import { canManageCustomers } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  const value = str(formData, key);
  return value === "" ? null : value;
}

function parseYear(value: string): number | null {
  if (!value) return null;
  const year = Number.parseInt(value, 10);
  if (!Number.isFinite(year)) return null;
  const currentYear = new Date().getFullYear();
  if (year < 1900 || year > currentYear + 1) return null;
  return year;
}

async function validateCustomer(businessId: string, customerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id")
    .eq("business_id", businessId)
    .eq("id", customerId)
    .is("deleted_at", null)
    .maybeSingle();
  return data?.id ?? null;
}

export async function createVehicle(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageCustomers(member.role)) {
    return { error: "You don't have permission to add vehicles." };
  }

  const customerId = str(formData, "customer_id");
  if (!customerId) return { error: "Customer is required." };

  const confirmedCustomerId = await validateCustomer(business.id, customerId);
  if (!confirmedCustomerId) return { error: "Selected customer does not belong to this business." };

  const year = parseYear(str(formData, "year"));
  if (str(formData, "year") && year == null) {
    return { error: "Year must be a valid year." };
  }

  const user = await getUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      business_id: business.id,
      customer_id: confirmedCustomerId,
      make: optional(formData, "make"),
      model: optional(formData, "model"),
      year,
      plate_number: optional(formData, "plate_number"),
      vin: optional(formData, "vin"),
      color: optional(formData, "color"),
      metadata: {},
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error) console.error("createVehicle failed", error);
    return { error: "Could not create vehicle." };
  }

  revalidatePath("/vehicles");
  revalidatePath(`/customers/${confirmedCustomerId}`);
  if (user) {
    revalidatePath("/customers");
  }
  redirect(`/vehicles/${data.id}`);
}

export async function updateVehicle(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageCustomers(member.role)) {
    return { error: "You don't have permission to edit vehicles." };
  }

  const id = str(formData, "id");
  if (!id) return { error: "Missing vehicle id." };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("vehicles")
    .select("id, business_id, customer_id")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (!current) return { error: "Vehicle not found." };

  const nextCustomerId = str(formData, "customer_id") || current.customer_id;
  const confirmedCustomerId = await validateCustomer(business.id, nextCustomerId);
  if (!confirmedCustomerId) return { error: "Selected customer does not belong to this business." };

  const yearValue = str(formData, "year");
  const year = yearValue ? parseYear(yearValue) : null;
  if (yearValue && year == null) return { error: "Year must be a valid year." };

  const { error } = await supabase
    .from("vehicles")
    .update({
      customer_id: confirmedCustomerId,
      make: optional(formData, "make"),
      model: optional(formData, "model"),
      year,
      plate_number: optional(formData, "plate_number"),
      vin: optional(formData, "vin"),
      color: optional(formData, "color"),
    })
    .eq("id", id)
    .eq("business_id", business.id);

  if (error) {
    console.error("updateVehicle failed", error);
    return { error: "Could not update vehicle. Please try again." };
  }

  revalidatePath(`/vehicles/${id}`);
  revalidatePath("/vehicles");
  revalidatePath(`/customers/${current.customer_id}`);
  if (current.customer_id !== confirmedCustomerId) {
    revalidatePath(`/customers/${confirmedCustomerId}`);
  }

  return { message: "Vehicle updated." };
}
