"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getUser, requireMembership } from "@/lib/auth";
import { canManageCustomers } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { firstValidationMessage } from "@/lib/validation/common";
import {
  createVehicleSchema,
  updateVehicleSchema,
} from "@/lib/validation/vehicles";

export type FormState = { error?: string; message?: string };

// Non-enumerating response for a missing OR cross-tenant vehicle.
const VEHICLE_UNAVAILABLE = "Vehicle not found or unavailable.";

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

  const parsed = createVehicleSchema.safeParse({
    customerId: formData.get("customer_id"),
    make: formData.get("make"),
    model: formData.get("model"),
    year: formData.get("year"),
    plateNumber: formData.get("plate_number"),
    vin: formData.get("vin"),
    color: formData.get("color"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  // The customer id is only a selector: it must resolve to a live customer of
  // the session's business before it can be written.
  const confirmedCustomerId = await validateCustomer(business.id, v.customerId);
  if (!confirmedCustomerId) return { error: "Selected customer does not belong to this business." };

  const user = await getUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      business_id: business.id,
      customer_id: confirmedCustomerId,
      make: v.make ?? null,
      model: v.model ?? null,
      year: v.year ?? null,
      plate_number: v.plateNumber ?? null,
      vin: v.vin ?? null,
      color: v.color ?? null,
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

  const parsed = updateVehicleSchema.safeParse({
    id: formData.get("id"),
    customerId: formData.get("customer_id"),
    make: formData.get("make"),
    model: formData.get("model"),
    year: formData.get("year"),
    plateNumber: formData.get("plate_number"),
    vin: formData.get("vin"),
    color: formData.get("color"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("vehicles")
    .select("id, business_id, customer_id")
    .eq("id", v.id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (!current) return { error: VEHICLE_UNAVAILABLE };

  const nextCustomerId = v.customerId ?? current.customer_id;
  const confirmedCustomerId = await validateCustomer(business.id, nextCustomerId);
  if (!confirmedCustomerId) return { error: "Selected customer does not belong to this business." };

  const { error } = await supabase
    .from("vehicles")
    .update({
      customer_id: confirmedCustomerId,
      make: v.make ?? null,
      model: v.model ?? null,
      year: v.year ?? null,
      plate_number: v.plateNumber ?? null,
      vin: v.vin ?? null,
      color: v.color ?? null,
    })
    .eq("id", v.id)
    .eq("business_id", business.id);

  if (error) {
    console.error("updateVehicle failed", error);
    return { error: "Could not update vehicle. Please try again." };
  }

  revalidatePath(`/vehicles/${v.id}`);
  revalidatePath("/vehicles");
  revalidatePath(`/customers/${current.customer_id}`);
  if (current.customer_id !== confirmedCustomerId) {
    revalidatePath(`/customers/${confirmedCustomerId}`);
  }

  return { message: "Vehicle updated." };
}
