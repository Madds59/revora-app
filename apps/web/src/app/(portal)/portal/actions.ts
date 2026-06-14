"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { getUser, requireCustomerPortal } from "@/lib/auth";
import type { ComplaintSeverity } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  const value = str(formData, key);
  return value === "" ? null : value;
}

export async function createComplaint(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { accounts } = await requireCustomerPortal();
  const user = await getUser();

  const customerId = str(formData, "customer_id");
  const businessId = str(formData, "business_id");
  const subject = str(formData, "subject");
  const description = str(formData, "description");
  const severity = (str(formData, "severity") || "medium") as ComplaintSeverity;

  const account =
    accounts.find((item) => item.business_id === businessId && item.id === customerId) ??
    accounts.find((item) => item.id === customerId);
  if (!account) return { error: "Select a linked account." };
  if (!subject) return { error: "Subject is required." };
  if (!description) return { error: "Description is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("complaints")
    .insert({
      business_id: account.business_id,
      customer_id: account.id,
      subject,
      description,
      severity,
      created_by: user?.id ?? null,
    });
  if (error) return { error: error.message };

  revalidatePath("/portal");
  revalidatePath("/portal/complaints");
  return { message: "Complaint submitted." };
}

export async function addComplaintReply(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { accounts } = await requireCustomerPortal();
  const user = await getUser();

  const complaintId = str(formData, "complaint_id");
  const businessId = str(formData, "business_id");
  const body = str(formData, "body");
  if (!complaintId || !businessId) return { error: "Missing complaint id." };
  if (!body) return { error: "Message body is required." };

  const account = accounts.find((item) => item.business_id === businessId);
  if (!account) return { error: "You do not have access to this complaint." };

  const supabase = await createClient();
  const { error } = await supabase.from("complaint_messages").insert({
    business_id: businessId,
    complaint_id: complaintId,
    parent_message_id: optional(formData, "parent_message_id"),
    sender_id: user?.id ?? null,
    sender_role: "customer",
    body,
    internal_only: false,
  });
  if (error) return { error: error.message };

  revalidatePath("/portal");
  revalidatePath("/portal/complaints");
  revalidatePath(`/portal/complaints/${complaintId}`);
  return { message: "Reply posted." };
}

export async function approveQuote(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { accounts } = await requireCustomerPortal();
  const user = await getUser();

  const quotationId = str(formData, "quotation_id");
  const businessId = str(formData, "business_id");
  const customerId = str(formData, "customer_id");
  const version = Number(str(formData, "quotation_version")) || 1;
  const language = str(formData, "language") || "en";
  const signature = str(formData, "signature");
  const customerNote = optional(formData, "customer_note");

  if (!quotationId || !businessId || !customerId)
    return { error: "Missing quotation details." };
  const account = accounts.find(
    (item) => item.business_id === businessId && item.id === customerId,
  );
  if (!account) return { error: "You do not have access to this quotation." };
  if (formData.get("acknowledge") !== "on")
    return { error: "Please acknowledge the parts, pricing, and terms." };
  if (!signature) return { error: "Please type your full name to sign." };

  const headerList = await headers();
  const supabase = await createClient();
  const { error } = await supabase.from("approvals").insert({
    business_id: businessId,
    quotation_id: quotationId,
    customer_id: customerId,
    quotation_version: version,
    language,
    acknowledgement_text: `I, ${signature}, acknowledge the parts, pricing, and terms of this quotation.`,
    user_agent: headerList.get("user-agent"),
    device_data: {
      signed_name: signature,
      signed_by: user?.id ?? null,
      customer_note: customerNote,
    },
  });
  if (error) return { error: error.message };

  revalidatePath("/portal");
  revalidatePath("/portal/quotes");
  revalidatePath(`/portal/quotes/${quotationId}`);
  return { message: "Quotation approved. Thank you." };
}

export async function rejectQuote(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { accounts } = await requireCustomerPortal();

  const quotationId = str(formData, "quotation_id");
  const businessId = str(formData, "business_id");
  const customerId = str(formData, "customer_id");
  const rejectionNote = optional(formData, "rejection_note");

  if (!quotationId || !businessId || !customerId) {
    return { error: "Missing quotation details." };
  }

  const account = accounts.find(
    (item) => item.business_id === businessId && item.id === customerId,
  );
  if (!account) return { error: "You do not have access to this quotation." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("customer_reject_quote", {
    target_quotation_id: quotationId,
    target_customer_id: customerId,
    rejection_note: rejectionNote,
  });
  if (error) return { error: error.message };

  revalidatePath("/portal");
  revalidatePath("/portal/quotes");
  revalidatePath(`/portal/quotes/${quotationId}`);
  return { message: "Quotation declined." };
}
