"use server";

import { revalidatePath } from "next/cache";

import { getUser, requireMembership } from "@/lib/auth";
import { enqueueComplaintStatusNotification } from "@/lib/notifications/service";
import { canManageComplaints } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { firstValidationMessage } from "@/lib/validation/common";
import {
  addComplaintMessageSchema,
  updateComplaintSchema,
} from "@/lib/validation/complaints";

export type FormState = { error?: string; message?: string };

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

  const parsed = updateComplaintSchema.safeParse({
    complaintId: formData.get("complaint_id"),
    status: formData.get("status"),
    severity: formData.get("severity"),
    assignedTo: formData.get("assigned_to"),
    resolutionSummary: formData.get("resolution_summary"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { complaintId, status, severity, assignedTo, resolutionSummary } =
    parsed.data;

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
  // Preserve "only touch fields that were submitted" semantics; a submitted-but-
  // blank assignee/summary clears it (validated value is undefined -> null).
  if (formData.has("assigned_to")) updates.assigned_to = assignedTo ?? null;
  if (formData.has("resolution_summary")) {
    updates.resolution_summary = resolutionSummary ?? null;
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
  const { member, business } = await requireMembership();
  if (!canManageComplaints(member.role)) {
    return { error: "You don't have permission to reply to complaints." };
  }

  const parsed = addComplaintMessageSchema.safeParse({
    complaintId: formData.get("complaint_id"),
    body: formData.get("body"),
    parentMessageId: formData.get("parent_message_id"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { complaintId, body, parentMessageId } = parsed.data;

  const user = await getUser();
  const supabase = await createClient();
  // business_id is derived from the authenticated membership/session, never from
  // client-supplied form data (APPSEC-09). RLS remains the enforcement backstop.
  const { error } = await supabase.from("complaint_messages").insert({
    business_id: business.id,
    complaint_id: complaintId,
    parent_message_id: parentMessageId ?? null,
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
