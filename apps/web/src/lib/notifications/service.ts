import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

import { canAttemptLiveSend } from "./provider.js";
import {
  isNotificationChannel,
  normalizeNotificationLocale,
  renderNotificationTemplate,
} from "./templates.js";

type NotificationChannel = "email" | "sms";
type NotificationStatus =
  | "failed"
  | "queued"
  | "sent"
  | "skipped_disabled"
  | "skipped_missing_recipient"
  | "skipped_no_provider"
  | "skipped_suppressed";

type NotificationSettings = {
  email_enabled: boolean;
  live_send_enabled: boolean;
  sms_enabled: boolean;
};

type NotificationPreference = {
  channel: string;
  enabled: boolean;
  template_key: string | null;
};

type CustomerRecipient = {
  email: string | null;
  full_name: string;
  id: string;
  phone: string | null;
  preferred_language: string;
};

type BusinessRow = {
  id: string;
  name: string;
};

type QueueCustomerNotificationInput = {
  businessId: string;
  channels?: NotificationChannel[];
  customerId: string;
  dedupeKey: string;
  payload: Record<string, Json | undefined>;
  templateKey: string;
  variables: Record<string, string | number | null | undefined>;
};

type DispatchResult = {
  attempted: number;
  failed: number;
  sent: number;
  skipped: number;
};

type NotificationEventForDispatch = {
  attempt_count: number;
  business_id: string;
  channel: string;
  customer_id: string | null;
  dedupe_key: string | null;
  id: string;
  locale: string;
  payload: Json;
  recipient_email: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  template_key: string;
};

function clean(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function statusCounts(result: DispatchResult, status: NotificationStatus) {
  if (status === "sent") result.sent += 1;
  else if (status === "failed") result.failed += 1;
  else result.skipped += 1;
}

async function getSettings(
  admin: SupabaseClient<Database>,
  businessId: string,
): Promise<NotificationSettings | null> {
  const { data } = await admin
    .from("business_notification_settings")
    .select("email_enabled, sms_enabled, live_send_enabled")
    .eq("business_id", businessId)
    .maybeSingle();
  return (data ?? null) as NotificationSettings | null;
}

async function getPreferences(
  admin: SupabaseClient<Database>,
  businessId: string,
  customerId: string,
) {
  const { data } = await admin
    .from("notification_preferences")
    .select("channel, template_key, enabled")
    .eq("business_id", businessId)
    .eq("customer_id", customerId);
  return (data ?? []) as NotificationPreference[];
}

function channelEnabled(settings: NotificationSettings | null, channel: NotificationChannel) {
  if (!settings) return false;
  return channel === "email" ? settings.email_enabled : settings.sms_enabled;
}

function preferenceEnabled(
  preferences: NotificationPreference[],
  channel: NotificationChannel,
  templateKey: string,
) {
  const relevant = preferences.filter(
    (preference) =>
      preference.channel === channel &&
      (!preference.template_key || preference.template_key === templateKey),
  );
  if (relevant.length === 0) return true;
  return relevant.every((preference) => preference.enabled);
}

function recipientForChannel(customer: CustomerRecipient, channel: NotificationChannel) {
  return channel === "email" ? clean(customer.email) : clean(customer.phone);
}

function skippedStatus({
  channel,
  customer,
  preferences,
  settings,
  templateKey,
}: {
  channel: NotificationChannel;
  customer: CustomerRecipient;
  preferences: NotificationPreference[];
  settings: NotificationSettings | null;
  templateKey: string;
}): NotificationStatus | null {
  if (!recipientForChannel(customer, channel)) return "skipped_missing_recipient";
  if (!channelEnabled(settings, channel)) return "skipped_disabled";
  if (!preferenceEnabled(preferences, channel, templateKey)) return "skipped_suppressed";
  return null;
}

async function loadCustomerContext(
  admin: SupabaseClient<Database>,
  businessId: string,
  customerId: string,
) {
  const [{ data: customer }, { data: business }] = await Promise.all([
    admin
      .from("customers")
      .select("id, full_name, email, phone, preferred_language")
      .eq("business_id", businessId)
      .eq("id", customerId)
      .maybeSingle(),
    admin.from("businesses").select("id, name").eq("id", businessId).maybeSingle(),
  ]);

  return {
    business: (business ?? null) as BusinessRow | null,
    customer: (customer ?? null) as CustomerRecipient | null,
  };
}

export async function queueCustomerNotification(
  input: QueueCustomerNotificationInput,
) {
  try {
    const admin = createAdminClient();
    const [{ business, customer }, settings, preferences] = await Promise.all([
      loadCustomerContext(admin, input.businessId, input.customerId),
      getSettings(admin, input.businessId),
      getPreferences(admin, input.businessId, input.customerId),
    ]);
    if (!business || !customer) return { inserted: 0, skipped: true };

    const locale = normalizeNotificationLocale(customer.preferred_language);
    const channels = input.channels ?? ["email", "sms"];
    const now = new Date().toISOString();
    const rows = channels
      .filter((channel) => isNotificationChannel(channel))
      .map((channel) => {
        const skipped = skippedStatus({
          channel,
          customer,
          preferences,
          settings,
          templateKey: input.templateKey,
        });
        const payload = {
          ...input.payload,
          business_name: business.name,
          customer_name: customer.full_name,
          template_variables: {
            ...input.variables,
            businessName: business.name,
            customerName: customer.full_name,
          },
        };

        return {
          business_id: input.businessId,
          channel,
          customer_id: input.customerId,
          dedupe_key: `${input.dedupeKey}:${channel}`,
          locale,
          payload,
          recipient_email: channel === "email" ? customer.email : null,
          recipient_name: customer.full_name,
          recipient_phone: channel === "sms" ? customer.phone : null,
          scheduled_for: now,
          status: skipped ?? "queued",
          template_key: input.templateKey,
        };
      });

    if (rows.length === 0) return { inserted: 0, skipped: true };
    const { error } = await admin
      .from("notification_events")
      .upsert(rows, {
        ignoreDuplicates: true,
        onConflict: "business_id,dedupe_key",
      });
    if (error) return { error: error.message, inserted: 0 };
    return { inserted: rows.length };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Notification queue failed.",
      inserted: 0,
    };
  }
}

async function sendEmail({
  body,
  subject,
  to,
}: {
  body: string;
  subject: string;
  to: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from: process.env.NOTIFICATIONS_EMAIL_FROM,
      subject,
      text: body,
      to,
    }),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const json = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!response.ok) {
    return {
      failureReason: json?.message ?? `Email provider returned ${response.status}.`,
      providerMessageId: null,
      status: "failed" as const,
    };
  }
  return {
    failureReason: null,
    providerMessageId: json?.id ?? null,
    status: "sent" as const,
  };
}

async function sendSms({ body, to }: { body: string; to: string }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN ?? "";
  const requestBody = new URLSearchParams({
    Body: body,
    From: process.env.TWILIO_FROM_NUMBER ?? "",
    To: to,
  });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      body: requestBody,
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    },
  );
  const json = (await response.json().catch(() => null)) as { message?: string; sid?: string } | null;
  if (!response.ok) {
    return {
      failureReason: json?.message ?? `SMS provider returned ${response.status}.`,
      providerMessageId: null,
      status: "failed" as const,
    };
  }
  return {
    failureReason: null,
    providerMessageId: json?.sid ?? null,
    status: "sent" as const,
  };
}

async function dispatchEvent(
  admin: SupabaseClient<Database>,
  event: NotificationEventForDispatch,
) {
  const channel = event.channel === "sms" ? "sms" : "email";
  const settings = await getSettings(admin, event.business_id);
  const recipient = channel === "email" ? clean(event.recipient_email) : clean(event.recipient_phone);
  const now = new Date().toISOString();

  let status: NotificationStatus = "sent";
  let provider = channel === "email" ? "resend" : "twilio";
  let providerMessageId: string | null = null;
  let failureReason: string | null = null;

  if (!recipient) {
    status = "skipped_missing_recipient";
    failureReason = "Recipient is missing.";
  } else if (!channelEnabled(settings, channel)) {
    status = "skipped_disabled";
    failureReason = "Channel is disabled for this business.";
  } else {
    const live = canAttemptLiveSend({
      businessLiveEnabled: Boolean(settings?.live_send_enabled),
      channel,
      env: process.env,
    });
    provider = live.provider;
    if (!live.ok) {
      status = live.status as NotificationStatus;
      failureReason = live.reason;
    } else {
      const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? (event.payload as Record<string, unknown>)
        : {};
      const variables =
        payload.template_variables &&
        typeof payload.template_variables === "object" &&
        !Array.isArray(payload.template_variables)
          ? (payload.template_variables as Record<string, string | number | null | undefined>)
          : {};
      const rendered = renderNotificationTemplate({
        channel,
        locale: event.locale,
        templateKey: event.template_key,
        variables,
      });
      const result =
        channel === "email"
          ? await sendEmail({ body: rendered.body, subject: rendered.subject, to: recipient })
          : await sendSms({ body: rendered.body, to: recipient });
      status = result.status;
      providerMessageId = result.providerMessageId;
      failureReason = result.failureReason;
    }
  }

  await admin.from("notification_delivery_attempts").insert({
    business_id: event.business_id,
    channel,
    failure_reason: failureReason,
    notification_event_id: event.id,
    provider,
    provider_message_id: providerMessageId,
    status,
  });

  await admin
    .from("notification_events")
    .update({
      attempt_count: event.attempt_count + 1,
      failed_at: status === "failed" ? now : null,
      failure_reason: failureReason,
      last_attempt_at: now,
      provider_message_id: providerMessageId,
      sent_at: status === "sent" ? now : null,
      status,
    })
    .eq("id", event.id);

  return status;
}

export async function processQueuedNotifications(limit = 20): Promise<DispatchResult> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("notification_events")
    .select(
      "id, business_id, customer_id, channel, template_key, payload, status, recipient_email, recipient_phone, recipient_name, locale, dedupe_key, attempt_count",
    )
    .in("channel", ["email", "sms"])
    .eq("status", "queued")
    .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return { attempted: 0, failed: 1, sent: 0, skipped: 0 };
  }

  const result: DispatchResult = { attempted: 0, failed: 0, sent: 0, skipped: 0 };
  for (const event of (data ?? []) as NotificationEventForDispatch[]) {
    result.attempted += 1;
    try {
      const status = await dispatchEvent(admin, event);
      statusCounts(result, status);
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

export async function enqueueQuoteSentNotification(quotationId: string) {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("quotations")
      .select("id, business_id, customer_id, quote_number, customer:customers(full_name), business:businesses(name)")
      .eq("id", quotationId)
      .maybeSingle();
    const quote = data as
      | {
          business_id: string;
          customer_id: string;
          id: string;
          quote_number: string;
        }
      | null;
    if (!quote) return { inserted: 0, skipped: true };
    return queueCustomerNotification({
      businessId: quote.business_id,
      customerId: quote.customer_id,
      dedupeKey: `quote_sent:${quote.id}`,
      payload: {
        quote_id: quote.id,
        quote_number: quote.quote_number,
        type: "quote_sent",
      },
      templateKey: "quote_sent",
      variables: {
        quoteNumber: quote.quote_number,
      },
    });
  } catch {
    return { inserted: 0, skipped: true };
  }
}

export async function enqueueQuoteDecisionNotification({
  decision,
  quotationId,
}: {
  decision: "approved" | "rejected";
  quotationId: string;
}) {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("quotations")
      .select("id, business_id, customer_id, quote_number")
      .eq("id", quotationId)
      .maybeSingle();
    const quote = data as
      | {
          business_id: string;
          customer_id: string;
          id: string;
          quote_number: string;
        }
      | null;
    if (!quote) return { inserted: 0, skipped: true };

    await admin.from("notification_events").upsert(
      {
        business_id: quote.business_id,
        channel: "push",
        customer_id: quote.customer_id,
        dedupe_key: `quote_${decision}:${quote.id}:push`,
        payload: {
          quote_id: quote.id,
          quote_number: quote.quote_number,
          type: `quote_${decision}`,
        },
        scheduled_for: new Date().toISOString(),
        status: "queued",
        template_key: decision === "approved" ? "quote_approved" : "quote_rejected",
      },
      { ignoreDuplicates: true, onConflict: "business_id,dedupe_key" },
    );
    return { inserted: 1 };
  } catch {
    return { inserted: 0, skipped: true };
  }
}

export async function enqueueJobStatusNotification({
  jobId,
  statusLabel,
}: {
  jobId: string;
  statusLabel: string;
}) {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("jobs")
      .select("id, business_id, customer_id, title, status")
      .eq("id", jobId)
      .maybeSingle();
    const job = data as
      | {
          business_id: string;
          customer_id: string | null;
          id: string;
          status: string;
          title: string;
        }
      | null;
    if (!job?.customer_id) return { inserted: 0, skipped: true };
    const templateKey = job.status === "completed" ? "job_completed" : "job_status_changed";
    return queueCustomerNotification({
      businessId: job.business_id,
      customerId: job.customer_id,
      dedupeKey: `job_status:${job.id}:${job.status}`,
      payload: {
        job_id: job.id,
        job_title: job.title,
        status: job.status,
        type: templateKey,
      },
      templateKey,
      variables: {
        jobTitle: job.title,
        statusLabel,
      },
    });
  } catch {
    return { inserted: 0, skipped: true };
  }
}

export async function enqueueComplaintStatusNotification({
  complaintId,
  statusLabel,
}: {
  complaintId: string;
  statusLabel: string;
}) {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("complaints")
      .select("id, business_id, customer_id, subject, status")
      .eq("id", complaintId)
      .maybeSingle();
    const complaint = data as
      | {
          business_id: string;
          customer_id: string | null;
          id: string;
          status: string;
          subject: string;
        }
      | null;
    if (!complaint?.customer_id) return { inserted: 0, skipped: true };
    return queueCustomerNotification({
      businessId: complaint.business_id,
      customerId: complaint.customer_id,
      dedupeKey: `complaint_status:${complaint.id}:${complaint.status}`,
      payload: {
        complaint_id: complaint.id,
        status: complaint.status,
        subject: complaint.subject,
        type: "complaint_status_changed",
      },
      templateKey: "complaint_status_changed",
      variables: {
        statusLabel,
        subject: complaint.subject,
      },
    });
  } catch {
    return { inserted: 0, skipped: true };
  }
}
