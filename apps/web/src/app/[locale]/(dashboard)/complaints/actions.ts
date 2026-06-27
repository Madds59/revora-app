"use server";

import { revalidatePath } from "next/cache";

import { getUser, requireMembership } from "@/lib/auth";
import { enqueueComplaintStatusNotification } from "@/lib/notifications/service";
import { canManageComplaints } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  const value = str(formData, key);
  return value === "" ? null : value;
}

function isChecked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

export async function updateComplaint(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member } = await requireMembership();
  if (!canManageComplaints(member.role)) {
    return { error: "You don't have permission to manage complaints." };
  }

  const complaintId = str(formData, "complaint_id");
  if (!complaintId) return { error: "Missing complaint id." };

  const status = str(formData, "status");
  const severity = str(formData, "severity");
  const assignedTo = optional(formData, "assigned_to");
  const resolutionSummary = optional(formData, "resolution_summary");

  const supabase = await createClient();
  const { data: currentComplaint, error: currentError } = await supabase
    .from("complaints")
    .select("status, resolved_at, escalated_at")
    .eq("id", complaintId)
    .maybeSingle();
  if (currentError) {
    console.error("updateComplaint lookup failed", currentError);
    return { error: "Could not load complaint. Please try again." };
  }
  if (!currentComplaint) return { error: "Complaint not found." };

  const updates: {
    status?: string;
    severity?: string;
    assigned_to?: string | null;
    resolution_summary?: string | null;
    resolved_at?: string | null;
    escalated_at?: string | null;
  } = {};
  if (status) {
    updates.status = status;
    if (
      (status === "resolved" || status === "closed") &&
      !currentComplaint.resolved_at &&
      currentComplaint.status !== status
    ) {
      updates.resolved_at = new Date().toISOString();
    }
    if (
      status === "escalated" &&
      !currentComplaint.escalated_at &&
      currentComplaint.status !== status
    ) {
      updates.escalated_at = new Date().toISOString();
    }
  }
  if (severity) updates.severity = severity;
  if (formData.has("assigned_to")) updates.assigned_to = assignedTo;
  if (formData.has("resolution_summary")) {
    updates.resolution_summary = resolutionSummary;
  }

  const { error } = await supabase
    .from("complaints")
    .update(updates as never)
    .eq("id", complaintId);
  if (error) {
    console.error("updateComplaint failed", error);
    return { error: "Could not update complaint. Please try again." };
  }

  if (status && status !== currentComplaint.status) {
    await enqueueComplaintStatusNotification({
      complaintId,
      statusLabel: status.replaceAll("_", " "),
    });
  }

  revalidatePath("/complaints");
  revalidatePath(`/complaints/${complaintId}`);
  revalidatePath("/", "layout");
  return { message: "Complaint updated." };
}

export async function addComplaintMessage(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member } = await requireMembership();
  if (!canManageComplaints(member.role)) {
    return { error: "You don't have permission to reply to complaints." };
  }

  const user = await getUser();
  const complaintId = str(formData, "complaint_id");
  const businessId = str(formData, "business_id");
  const body = str(formData, "body");
  if (!complaintId || !businessId) return { error: "Missing complaint id." };
  if (!body) return { error: "Message body is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("complaint_messages").insert({
    business_id: businessId,
    complaint_id: complaintId,
    parent_message_id: optional(formData, "parent_message_id"),
    sender_id: user?.id ?? null,
    sender_role: member.role,
    body,
    internal_only: isChecked(formData, "internal_only"),
  });
  if (error) {
    console.error("addComplaintMessage failed", error);
    return { error: "Could not post reply. Please try again." };
  }

  revalidatePath("/complaints");
  revalidatePath(`/complaints/${complaintId}`);
  return { message: "Reply posted." };
}
