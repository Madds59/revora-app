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
import { firstValidationMessage } from "@/lib/validation/common";
import {
  portalComplaintReplySchema,
  portalCreateComplaintSchema,
} from "@/lib/validation/complaints";
import {
  approveQuoteSchema,
  rejectQuoteSchema,
} from "@/lib/validation/quotations";

// Non-enumerating response for missing OR unowned resources (APPSEC-09 Phase 2 /
// APPSEC-11): a customer must not be able to distinguish "does not exist" from
// "belongs to someone else".
const QUOTE_UNAVAILABLE = "Quotation not found or unavailable.";
const COMPLAINT_UNAVAILABLE = "Complaint not found or unavailable.";

export type FormState = { error?: string; message?: string };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | undefined {
  const value = str(formData, key);
  return value === "" ? undefined : value;
}

async function recordComplaintNotification({
  businessId: sessionBusinessId,
  customerId: sessionCustomerId,
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
    // Callers pass only session-derived account values (APPSEC-09 Phase 2).
    const supabase = createAdminClient();
    const { error } = await supabase.from("notification_events").insert({
      business_id: sessionBusinessId,
      customer_id: sessionCustomerId,
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

  const parsed = portalCreateComplaintSchema.safeParse({
    customerId: formData.get("customer_id"),
    businessId: formData.get("business_id"),
    subject: formData.get("subject"),
    description: formData.get("description"),
    severity: formData.get("severity"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { subject, description } = parsed.data;
  const severity = parsed.data.severity as ComplaintSeverity;

  // The client ids only SELECT one of the session's own linked accounts; the
  // mutation uses the session-derived account row, never the raw client values.
  const account = accounts.find(
    (item) =>
      item.id === parsed.data.customerId &&
      item.business_id === parsed.data.businessId,
  );
  if (!account) return { error: "Select a linked account." };

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
  if (error || !data) {
    if (error) console.error("createComplaint failed", error);
    return { error: "Could not submit complaint." };
  }

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

  const parsed = portalComplaintReplySchema.safeParse({
    complaintId: formData.get("complaint_id"),
    businessId: formData.get("business_id"),
    body: formData.get("body"),
    parentMessageId: formData.get("parent_message_id"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { complaintId, body, parentMessageId } = parsed.data;

  // Explicit ownership check (APPSEC-09 Phase 2): the complaint must belong to
  // one of the session's own linked customer accounts before any insert. RLS
  // (`complaint_messages_customer_insert`) remains the enforcement backstop.
  const supabase = await createClient();
  const { data: complaintRow, error: complaintError } = await supabase
    .from("complaints")
    .select("id, business_id, customer_id")
    .eq("id", complaintId)
    .maybeSingle();
  if (complaintError) {
    console.error("addComplaintReply lookup failed", complaintError);
    return { error: "Could not post your reply. Please try again." };
  }
  const ownerAccount =
    complaintRow &&
    accounts.find(
      (item) =>
        item.id === complaintRow.customer_id &&
        item.business_id === complaintRow.business_id,
    );
  if (!ownerAccount) return { error: COMPLAINT_UNAVAILABLE };

  // Tenant identity comes from the verified complaint row (session-scoped),
  // never from client form data.
  const { error } = await supabase.from("complaint_messages").insert({
    business_id: complaintRow.business_id,
    complaint_id: complaintRow.id,
    parent_message_id: parentMessageId ?? null,
    sender_id: user?.id ?? null,
    sender_role: "customer",
    body,
    internal_only: false,
  });
  if (error) {
    console.error("addComplaintReply failed", error);
    return { error: "Could not post your reply. Please try again." };
  }

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

  const parsed = approveQuoteSchema.safeParse({
    quotationId: formData.get("quotation_id"),
    businessId: formData.get("business_id"),
    customerId: formData.get("customer_id"),
    quotationVersion: formData.get("quotation_version"),
    language: formData.get("language"),
    signature: formData.get("signature"),
    customerNote: formData.get("customer_note"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const account = accounts.find(
    (item) => item.id === v.customerId && item.business_id === v.businessId,
  );
  if (!account) return { error: QUOTE_UNAVAILABLE };
  if (formData.get("acknowledge") !== "on")
    return { error: "Please acknowledge the parts, pricing, and terms." };

  // Explicit ownership + state check before mutation (APPSEC-11): the quotation
  // must belong to this session's customer account and still be approvable. RLS
  // (`approvals_customer_insert`) remains the enforcement backstop.
  const supabase = await createClient();
  const { data: quoteRow, error: quoteError } = await supabase
    .from("quotations")
    .select("id, business_id, customer_id, status, current_version")
    .eq("id", v.quotationId)
    .maybeSingle();
  if (quoteError) {
    console.error("approveQuote lookup failed", quoteError);
    return { error: "Could not record your approval. Please try again." };
  }
  if (
    !quoteRow ||
    quoteRow.customer_id !== account.id ||
    quoteRow.business_id !== account.business_id
  ) {
    return { error: QUOTE_UNAVAILABLE };
  }
  if (quoteRow.status !== "sent")
    return { error: "This quotation can no longer be approved." };
  if (v.quotationVersion !== quoteRow.current_version)
    return {
      error: "This quotation has been updated. Please review the latest version.",
    };

  const headerList = await headers();
  const { error } = await supabase.from("approvals").insert({
    // Identity fields come from the session-verified quotation row.
    business_id: quoteRow.business_id,
    quotation_id: quoteRow.id,
    customer_id: quoteRow.customer_id,
    quotation_version: quoteRow.current_version,
    language: v.language,
    acknowledgement_text: `I, ${v.signature}, acknowledge the parts, pricing, and terms of this quotation.`,
    user_agent: headerList.get("user-agent"),
    device_data: {
      signed_name: v.signature,
      signed_by: user?.id ?? null,
      customer_note: v.customerNote,
    },
  });
  if (error) {
    console.error("approveQuote failed", error);
    return { error: "Could not record your approval. Please try again." };
  }

  await enqueueQuoteDecisionNotification({
    decision: "approved",
    quotationId: quoteRow.id,
  });

  revalidatePath("/portal");
  revalidatePath("/portal/quotes");
  revalidatePath(`/portal/quotes/${quoteRow.id}`);
  const locale = normalizeLocale(await getLocale());
  redirect(switchLocalePath("/portal/quotes?quote_status=approved", locale));
}

export async function rejectQuote(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { accounts } = await requireCustomerPortal();

  const parsed = rejectQuoteSchema.safeParse({
    quotationId: formData.get("quotation_id"),
    businessId: formData.get("business_id"),
    customerId: formData.get("customer_id"),
    rejectionNote: formData.get("rejection_note"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const account = accounts.find(
    (item) => item.id === v.customerId && item.business_id === v.businessId,
  );
  if (!account) return { error: QUOTE_UNAVAILABLE };

  // Explicit ownership + state check before mutation (APPSEC-11); the
  // `customer_reject_quote` SECURITY DEFINER RPC re-checks ownership as the
  // enforcement backstop.
  const supabase = await createClient();
  const { data: quoteRow, error: quoteError } = await supabase
    .from("quotations")
    .select("id, business_id, customer_id, status")
    .eq("id", v.quotationId)
    .maybeSingle();
  if (quoteError) {
    console.error("rejectQuote lookup failed", quoteError);
    return { error: "Could not record your decision. Please try again." };
  }
  if (
    !quoteRow ||
    quoteRow.customer_id !== account.id ||
    quoteRow.business_id !== account.business_id
  ) {
    return { error: QUOTE_UNAVAILABLE };
  }
  if (quoteRow.status !== "sent")
    return { error: "This quotation can no longer be declined." };

  const { error } = await supabase.rpc("customer_reject_quote", {
    // Session-derived identifiers only; the raw client ids never reach the RPC.
    target_quotation_id: quoteRow.id,
    target_customer_id: account.id,
    rejection_note: v.rejectionNote ?? undefined,
  });
  if (error) {
    console.error("rejectQuote failed", error);
    return { error: "Could not record your decision. Please try again." };
  }

  await enqueueQuoteDecisionNotification({
    decision: "rejected",
    quotationId: quoteRow.id,
  });

  revalidatePath("/portal");
  revalidatePath("/portal/quotes");
  revalidatePath(`/portal/quotes/${quoteRow.id}`);
  const locale = normalizeLocale(await getLocale());
  redirect(switchLocalePath("/portal/quotes?quote_status=declined", locale));
}
