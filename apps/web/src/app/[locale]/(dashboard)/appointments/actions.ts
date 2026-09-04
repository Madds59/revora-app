"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getUser, requireMembership } from "@/lib/auth";
import { canManageAppointments } from "@/lib/permissions";
import { formatDateTime, type AppLocale } from "@/lib/formatters";
import { enqueueAppointmentDecisionNotification } from "@/lib/notifications/service";
import { createClient } from "@/lib/supabase/server";
import { firstValidationMessage } from "@/lib/validation/common";
import {
  appointmentIdSchema,
  confirmAppointmentSchema,
  createAppointmentSchema,
  declineAppointmentSchema,
} from "@/lib/validation/appointments";

export type FormState = { error?: string; message?: string };

export async function createAppointment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageAppointments(member.role))
    return { error: "You don't have permission to schedule appointments." };

  const parsed = createAppointmentSchema.safeParse({
    customerId: formData.get("customer_id"),
    branchId: formData.get("branch_id"),
    vehicleId: formData.get("vehicle_id"),
    requestedStart: formData.get("requested_start"),
    requestedEnd: formData.get("requested_end"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const user = await getUser();
  const supabase = await createClient();

  // APPSEC-17 defense in depth (RLS appointments_staff_manage in 0035 is the
  // real gate): customer_id / branch_id / vehicle_id are client-supplied and
  // were previously written straight into the insert alongside our own
  // business_id, so nothing stopped an appointment referencing another
  // tenant's rows. Resolve each one inside our own business first.
  const [{ data: customer }, { data: branch }] = await Promise.all([
    supabase
      .from("customers")
      .select("id")
      .eq("business_id", business.id)
      .eq("id", v.customerId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("branches")
      .select("id")
      .eq("business_id", business.id)
      .eq("id", v.branchId)
      .maybeSingle(),
  ]);
  if (!customer) return { error: "Select a customer from this business." };
  if (!branch) return { error: "Select a branch from this business." };

  if (v.vehicleId) {
    // Same business is not enough -- the vehicle must be this customer's.
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("id")
      .eq("business_id", business.id)
      .eq("customer_id", v.customerId)
      .eq("id", v.vehicleId)
      .maybeSingle();
    if (!vehicle) return { error: "Select a vehicle that belongs to this customer." };
  }

  const { error } = await supabase.from("appointments").insert({
    business_id: business.id,
    branch_id: v.branchId,
    customer_id: v.customerId,
    vehicle_id: v.vehicleId ?? null,
    requested_start: v.requestedStart,
    requested_end: v.requestedEnd,
    notes: v.notes ?? null,
    created_by: user?.id ?? null,
  });
  if (error) {
    console.error("createAppointment failed", error);
    return { error: "Could not create the appointment." };
  }

  revalidatePath("/appointments");
  return { message: "Appointment created." };
}

export async function confirmAppointment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member } = await requireMembership();
  if (!canManageAppointments(member.role))
    return { error: "You don't have permission to manage appointments." };

  const parsed = confirmAppointmentSchema.safeParse({
    id: formData.get("id"),
    confirmedStart: formData.get("confirmed_start"),
    confirmedEnd: formData.get("confirmed_end"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { id, confirmedStart, confirmedEnd } = parsed.data;

  // Narrow the client-supplied locale to the app's allowlist rather than
  // casting it: formatDateTime takes AppLocale, and an unconstrained string
  // has no business reaching Intl from a form field.
  const rawLocale = formData.get("locale");
  const locale: AppLocale = rawLocale === "ar" ? "ar" : "en";
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_appointment", {
    target_appointment_id: id,
    new_start: confirmedStart,
    new_end: confirmedEnd,
  });
  if (error) {
    console.error("confirmAppointment failed", error);
    if (error.message?.includes("capacity")) {
      return { error: "That slot is at capacity for this branch. Pick another time." };
    }
    return { error: "Could not confirm the appointment." };
  }

  await enqueueAppointmentDecisionNotification({
    appointmentId: id,
    status: "confirmed",
    slotLabel: `${formatDateTime(confirmedStart, undefined, locale)}`,
  });

  revalidatePath(`/appointments/${id}`);
  revalidatePath("/appointments");
  return { message: "Appointment confirmed." };
}

export async function declineAppointment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member } = await requireMembership();
  if (!canManageAppointments(member.role))
    return { error: "You don't have permission to manage appointments." };

  const parsed = declineAppointmentSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { id, reason } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_appointment", {
    target_appointment_id: id,
    reason,
  });
  if (error) {
    console.error("declineAppointment failed", error);
    return { error: "Could not decline the appointment." };
  }

  await enqueueAppointmentDecisionNotification({ appointmentId: id, status: "declined" });

  revalidatePath(`/appointments/${id}`);
  revalidatePath("/appointments");
  return { message: "Appointment declined." };
}

export async function cancelAppointmentStaff(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member } = await requireMembership();
  if (!canManageAppointments(member.role))
    return { error: "You don't have permission to manage appointments." };

  const parsed = appointmentIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_appointment", {
    target_appointment_id: parsed.data.id,
  });
  if (error) {
    console.error("cancelAppointmentStaff failed", error);
    return { error: "Could not cancel the appointment." };
  }

  revalidatePath(`/appointments/${parsed.data.id}`);
  revalidatePath("/appointments");
  return { message: "Appointment cancelled." };
}

/** Converts a confirmed appointment into a quotation DRAFT (never a job
 * directly -- jobs are only ever created from an approved quote). */
export async function convertAppointmentToQuotation(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member } = await requireMembership();
  if (!canManageAppointments(member.role))
    return { error: "You don't have permission to convert appointments." };

  const parsed = appointmentIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("convert_appointment_to_quotation", {
    target_appointment_id: parsed.data.id,
  });
  if (error || !data) {
    if (error) console.error("convertAppointmentToQuotation failed", error);
    return { error: "Could not create a quotation from this appointment." };
  }

  redirect(`/quotations/${data}`);
}
