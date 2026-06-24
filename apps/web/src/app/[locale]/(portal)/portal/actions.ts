"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { getUser, requireCustomerPortal } from "@/lib/auth";
import type { ComplaintSeverity } from "@/lib/database.types";
import { normalizeLocale, switchLocalePath } from "@/lib/locale-path";
import { enqueueQuoteDecisionNotification } from "@/lib/notifications/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { businessRatingInputSchema } from "@/lib/ratings";

export type FormState = { error?: string; message?: string };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | undefined {
  const value = str(formData, key);
  return value === "" ? undefined : value;
}

async function recordComplaintNotification({
  businessId,
  customerId,
  complaintId,
  subject,
  severity,
}: {
  businessId: string;
  complaintId: string;
  customerId: string;
  severity: ComplaintSeverity;
  subject: string;
}) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("notification_events").insert({
      business_id: businessId,
      customer_id: customerId,
      channel: "push",
      template_key: "complaint_submitted",
      payload: {
        type: "complaint_submitted",
        complaint_id: complaintId,
        subject,
        severity,
      },
      status: "queued",
      scheduled_for: new Date().toISOString(),
    });

    return error;
  } catch {
    return null;
  }
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
  const { data, error } = await supabase
    .from("complaints")
    .insert({
      business_id: account.business_id,
      customer_id: account.id,
      subject,
      description,
      severity,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not submit complaint." };

  const notificationError = await recordComplaintNotification({
    businessId: account.business_id,
    customerId: account.id,
    complaintId: data.id,
    subject,
    severity,
  });
  if (notificationError) {
    // Complaints must still be created even if notification write fails.
  }

  const locale = await getLocale();
  revalidatePath("/portal");
  revalidatePath("/portal/complaints");
  redirect(`/${locale}/portal/complaints`);
}

export async function saveBusinessRating(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { accounts } = await requireCustomerPortal();
  const t = await getTranslations("ratings");

  const parsed = businessRatingInputSchema.safeParse({
    businessId: str(formData, "business_id"),
    customerId: str(formData, "customer_id"),
    rating: str(formData, "rating"),
    review: optional(formData, "review"),
  });
  if (!parsed.success) return { error: t("form.invalid") };

  const account = accounts.find(
    (item) =>
      item.business_id === parsed.data.businessId && item.id === parsed.data.customerId,
  );
  if (!account) return { error: t("form.notEligible") };

  const supabase = await createClient();
  const { error } = await supabase.from("business_ratings").upsert(
    {
      business_id: account.business_id,
      customer_id: account.id,
      rating: parsed.data.rating,
      review: parsed.data.review ?? null,
    },
    { onConflict: "business_id,customer_id" },
  );
  if (error) return { error: t("form.error") };

  revalidatePath("/portal");
  revalidatePath("/portal/jobs");
  revalidatePath("/portal/quotes");
  revalidatePath("/analytics");
  return { message: t("form.saved") };
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

  await enqueueQuoteDecisionNotification({
    decision: "approved",
    quotationId,
  });

  revalidatePath("/portal");
  revalidatePath("/portal/quotes");
  revalidatePath(`/portal/quotes/${quotationId}`);
  const locale = normalizeLocale(await getLocale());
  redirect(switchLocalePath("/portal/quotes?quote_status=approved", locale));
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

  await enqueueQuoteDecisionNotification({
    decision: "rejected",
    quotationId,
  });

  revalidatePath("/portal");
  revalidatePath("/portal/quotes");
  revalidatePath(`/portal/quotes/${quotationId}`);
  const locale = normalizeLocale(await getLocale());
  redirect(switchLocalePath("/portal/quotes?quote_status=declined", locale));
}
