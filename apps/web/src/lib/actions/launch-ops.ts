"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";

import { getCurrentProfile, getUser, requireCustomerPortal, requireMembership } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canManageSettings } from "@/lib/permissions";
import {
  feedbackReportSubmissionSchema,
  feedbackReportUpdateSchema,
  implementationProgressSchema,
} from "@/lib/launch-ops";

export type FormState = { error?: string; message?: string };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | undefined {
  const value = str(formData, key);
  return value === "" ? undefined : value;
}

async function recordFeedbackNotification({
  businessId,
  customerId,
  feedbackReportId,
  category,
  severity,
  title,
  pageUrl,
}: {
  businessId: string;
  customerId: string | null;
  feedbackReportId: string;
  category: string;
  severity: string;
  title: string;
  pageUrl?: string;
}) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("notification_events").insert({
      business_id: businessId,
      customer_id: customerId,
      channel: "push",
      template_key: "feedback_submitted",
      payload: {
        type: "feedback_submitted",
        feedback_report_id: feedbackReportId,
        category,
        severity,
        title,
        page_url: pageUrl ?? null,
      },
      status: "queued",
      scheduled_for: new Date().toISOString(),
    });
    return error;
  } catch {
    return null;
  }
}

async function getActorDetails() {
  const [user, profile] = await Promise.all([getUser(), getCurrentProfile()]);
  return {
    user,
    profile,
    name: profile?.full_name ?? user?.email ?? null,
    email: user?.email ?? null,
  };
}

export async function submitFeedbackReport(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = (await getLocale()) === "ar" ? "ar" : "en";
  const t = await getTranslations("feedback.form");

  const parsed = feedbackReportSubmissionSchema.safeParse({
    businessId: str(formData, "business_id"),
    customerId: optional(formData, "customer_id"),
    category: str(formData, "category"),
    severity: str(formData, "severity") || "normal",
    title: str(formData, "title"),
    description: str(formData, "description"),
    pageUrl: optional(formData, "page_url"),
    browserInfo: optional(formData, "browser_info"),
    source: str(formData, "source") || "web",
    locale,
  });
  if (!parsed.success) return { error: t("invalid") };

  const { user, name, email } = await getActorDetails();
  const source = parsed.data.source;
  const isPortal = source === "portal";

  if (isPortal) {
    const { accounts } = await requireCustomerPortal();
    const account = accounts.find(
      (item) =>
        item.business_id === parsed.data.businessId &&
        item.id === parsed.data.customerId,
    );
    if (!account) return { error: t("notEligible") };
  } else {
    const { business } = await requireMembership();
    if (business.id !== parsed.data.businessId) return { error: t("notEligible") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_reports")
    .insert({
      business_id: parsed.data.businessId,
      customer_id: parsed.data.customerId ?? null,
      submitted_by: user?.id ?? null,
      submitted_by_email: email,
      submitted_by_name: name,
      submitted_role: isPortal ? "customer" : "staff",
      source: parsed.data.source,
      locale: parsed.data.locale,
      category: parsed.data.category,
      severity: parsed.data.severity,
      title: parsed.data.title,
      description: parsed.data.description,
      page_url: parsed.data.pageUrl ?? null,
      browser_info: parsed.data.browserInfo ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: t("error") };

  const notificationError = await recordFeedbackNotification({
    businessId: parsed.data.businessId,
    customerId: parsed.data.customerId ?? null,
    feedbackReportId: data.id,
    category: parsed.data.category,
    severity: parsed.data.severity,
    title: parsed.data.title,
    pageUrl: parsed.data.pageUrl,
  });
  if (notificationError) {
    // Feedback still succeeds if notification fan-out fails.
  }

  revalidatePath("/feedback");
  revalidatePath("/portal/feedback");
  revalidatePath("/notifications");
  return { message: t("saved") };
}

export async function updateFeedbackReport(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  const t = await getTranslations("feedback.inbox");
  if (!canManageSettings(member.role)) {
    return { error: t("forbiddenUpdate") };
  }

  const parsed = feedbackReportUpdateSchema.safeParse({
    feedbackReportId: str(formData, "feedback_report_id"),
    status: str(formData, "status"),
    priority: str(formData, "priority"),
  });
  if (!parsed.success) return { error: t("invalidUpdate") };

  const supabase = await createClient();
  const resolvedAt = ["resolved", "closed"].includes(parsed.data.status)
    ? new Date().toISOString()
    : null;
  const { error } = await supabase
    .from("feedback_reports")
    .update({
      status: parsed.data.status,
      priority: parsed.data.priority,
      resolved_at: resolvedAt,
      resolved_by: resolvedAt ? (await getUser())?.id ?? null : null,
    })
    .eq("id", parsed.data.feedbackReportId)
    .eq("business_id", business.id);
  if (error) return { error: t("error") };

  revalidatePath("/feedback");
  revalidatePath("/notifications");
  return { message: t("updated") };
}

export async function saveImplementationProgress(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  const t = await getTranslations("implementation.form");
  if (!canManageSettings(member.role)) {
    return { error: t("forbiddenUpdate") };
  }

  const parsed = implementationProgressSchema.safeParse({
    businessId: str(formData, "business_id"),
    stage: str(formData, "stage"),
    notes: optional(formData, "notes"),
  });
  if (!parsed.success) return { error: t("invalid") };
  if (parsed.data.businessId !== business.id) return { error: t("invalid") };

  const supabase = await createClient();
  const { error } = await supabase.from("business_implementation_progress").upsert(
    {
      business_id: business.id,
      stage: parsed.data.stage,
      notes: parsed.data.notes ?? null,
      assigned_owner: (await getUser())?.id ?? null,
    },
    { onConflict: "business_id" },
  );
  if (error) return { error: t("error") };

  revalidatePath("/implementation");
  revalidatePath("/implementation/import-templates");
  return { message: t("saved") };
}
