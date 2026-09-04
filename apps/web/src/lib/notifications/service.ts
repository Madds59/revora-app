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
import {
  authorizeEventForDispatch,
  IN_APP_CHANNEL,
  boundedAttemptCount,
  isClaimedProcessingStatus,
  normalizeProviderFailure,
  normalizeProviderMessageId,
  persistablePayloadSchema,
  queueCustomerNotificationSchema,
  TEMPLATE_SOURCES,
} from "@/lib/validation/notifications";

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
  status?: string;
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
    // Validate the caller's selectors before any privileged read or write.
    const parsed = queueCustomerNotificationSchema.safeParse(input);
    if (!parsed.success) {
      console.error("queueCustomerNotification rejected", "input_invalid");
      return { error: "Notification queue failed.", inserted: 0 };
    }
    const v = parsed.data;

    const admin = createAdminClient();
    const [{ business, customer }, settings, preferences] = await Promise.all([
      loadCustomerContext(admin, v.businessId, v.customerId),
      getSettings(admin, v.businessId),
      getPreferences(admin, v.businessId, v.customerId),
    ]);
    // The customer is loaded under the business, so this also proves the
    // relationship — a mismatched pair yields no row and queues nothing.
    if (!business || !customer) return { inserted: 0, skipped: true };

    const locale = normalizeNotificationLocale(customer.preferred_language);
    const channels = v.channels;
    const now = new Date().toISOString();
    const rows = channels
      .filter((channel): channel is NotificationChannel => isNotificationChannel(channel))
      .map((channel) => {
        const skipped = skippedStatus({
          channel,
          customer,
          preferences,
          settings,
          templateKey: v.templateKey,
        });
        // Allowlisted payload only: unknown caller keys are stripped, so no
        // secret, Storage path, signed URL or arbitrary URL can be persisted.
        const payloadParse = persistablePayloadSchema.safeParse({
          ...(v.payload ?? {}),
          business_name: business.name,
          customer_name: customer.full_name,
          template_variables: {
            ...(v.variables ?? {}),
            businessName: business.name,
            customerName: customer.full_name,
          },
        });
        const payload = payloadParse.success ? payloadParse.data : null;

        return {
          // Identity comes from the VERIFIED rows, not the caller's selectors.
          business_id: business.id,
          channel,
          customer_id: customer.id,
          dedupe_key: `${v.dedupeKey}:${channel}`,
          locale,
          payload,
          recipient_email: channel === "email" ? customer.email : null,
          recipient_name: customer.full_name,
          recipient_phone: channel === "sms" ? customer.phone : null,
          scheduled_for: now,
          status: skipped ?? "queued",
          template_key: v.templateKey,
        };
      })
      .filter(
        (row): row is typeof row & { payload: NonNullable<typeof row.payload> } =>
          row.payload !== null,
      );

    if (rows.length === 0) return { inserted: 0, skipped: true };
    const { error } = await admin
      .from("notification_events")
      .upsert(rows, {
        ignoreDuplicates: true,
        onConflict: "business_id,dedupe_key",
      });
    if (error) {
      console.error("queueCustomerNotification failed", error);
      return { error: "Notification queue failed.", inserted: 0 };
    }
    return { inserted: rows.length };
  } catch (error) {
    console.error("queueCustomerNotification threw", error);
    return { error: "Notification queue failed.", inserted: 0 };
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
    // Never propagate the provider's own message: it can echo the destination
    // or rendered content. Only a stable internal category is kept.
    return {
      failureReason: normalizeProviderFailure(response.status),
      providerMessageId: null,
      status: "failed" as const,
    };
  }
  return {
    failureReason: null,
    providerMessageId: normalizeProviderMessageId(json?.id ?? null),
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
    // Same rule as email: provider text is replaced by a stable category.
    return {
      failureReason: normalizeProviderFailure(response.status),
      providerMessageId: null,
      status: "failed" as const,
    };
  }
  return {
    failureReason: null,
    providerMessageId: normalizeProviderMessageId(json?.sid ?? null),
    status: "sent" as const,
  };
}

/**
 * Confirm the payload's source resource lives in the event's business (and, for
 * customer-scoped tables, belongs to the same customer). The claim RPC does not
 * return the source resource, so this costs one extra scoped query per event
 * that has one.
 */
async function sourceResourceMatches(
  admin: SupabaseClient<Database>,
  event: { business_id: string; customer_id: string | null; template_key: string; payload: unknown },
): Promise<boolean | null> {
  const source = TEMPLATE_SOURCES[event.template_key as keyof typeof TEMPLATE_SOURCES];
  if (!source?.table || !source.payloadKey) return null;

  const payload =
    event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? (event.payload as Record<string, unknown>)
      : {};
  const sourceId = payload[source.payloadKey];
  if (typeof sourceId !== "string") return false;

  // Explicit branches so each query is statically typed against its own table.
  const query =
    source.table === "quotations"
      ? admin.from("quotations").select("id, business_id, customer_id")
      : source.table === "jobs"
        ? admin.from("jobs").select("id, business_id, customer_id")
        : source.table === "complaints"
          ? admin.from("complaints").select("id, business_id, customer_id")
          : null;
  if (!query) return false;

  const { data } = await query
    .eq("id", sourceId)
    .eq("business_id", event.business_id)
    .maybeSingle();
  if (!data) return false;
  const row = data as { customer_id: string | null };
  // When both the event and the resource name a customer, they must agree.
  if (event.customer_id && row.customer_id && row.customer_id !== event.customer_id) {
    return false;
  }
  return true;
}

/**
 * Dispatch one claimed event.
 *
 * The claimed row is UNTRUSTED stored input: the claim RPC selects by
 * channel/status/schedule only and hands back whatever recipient, channel,
 * template, locale and payload the row happens to carry. Before anything is
 * sent, the business and customer are re-loaded, the source resource is proved
 * to belong to the business, and the destination is **re-derived from the
 * verified customer** — the stored `recipient_email`/`recipient_phone` columns
 * are never used to address a message.
 */
async function dispatchEvent(
  admin: SupabaseClient<Database>,
  event: NotificationEventForDispatch,
) {
  const now = new Date().toISOString();
  const attemptBase = boundedAttemptCount(event.attempt_count);

  // Re-load the authorization inputs; never trust the row's own copies.
  const [{ business, customer }, sourceMatches] = await Promise.all([
    loadCustomerContext(admin, event.business_id, event.customer_id ?? ""),
    sourceResourceMatches(admin, event),
  ]);

  const decision = authorizeEventForDispatch({
    event,
    business,
    customer,
    sourceMatches,
  });

  if (!decision.allowed) {
    // Fail closed: no provider call, a privacy-safe attempt row, and a terminal
    // status so the row cannot spin in the queue forever.
    const status: NotificationStatus =
      decision.code === "recipient_unresolved"
        ? "skipped_missing_recipient"
        : "failed";
    console.error("notification dispatch denied", decision.code);
    await recordAttempt(admin, {
      businessId: event.business_id,
      channel: isNotificationChannel(event.channel) ? event.channel : "email",
      eventId: event.id,
      failureReason: decision.code ?? "denied",
      provider: "none",
      providerMessageId: null,
      status,
    });
    await finalizeEvent(admin, {
      attemptCount: attemptBase + 1,
      eventId: event.id,
      failureReason: decision.code ?? "denied",
      now,
      providerMessageId: null,
      status,
    });
    return status;
  }

  const channel = decision.channel as NotificationChannel;
  const destination = decision.destination as string;
  const settings = await getSettings(admin, business!.id);

  let status: NotificationStatus = "sent";
  let provider = channel === "email" ? "resend" : "twilio";
  let providerMessageId: string | null = null;
  let failureReason: string | null = null;

  if (!channelEnabled(settings, channel)) {
    status = "skipped_disabled";
    failureReason = "channel_disabled";
  } else {
    const live = canAttemptLiveSend({
      businessLiveEnabled: Boolean(settings?.live_send_enabled),
      channel,
      env: process.env,
    });
    provider = live.provider;
    if (!live.ok) {
      // Live delivery disabled (the default): no provider is contacted.
      status = live.status as NotificationStatus;
      failureReason = live.status;
    } else {
      const rendered = renderNotificationTemplate({
        channel,
        locale: decision.locale as string,
        templateKey: decision.templateKey as string,
        variables: decision.variables,
      });
      const result =
        channel === "email"
          ? await sendEmail({
              body: rendered.body,
              subject: rendered.subject,
              to: destination,
            })
          : await sendSms({ body: rendered.body, to: destination });
      status = result.status;
      providerMessageId = result.providerMessageId;
      failureReason = result.failureReason;
    }
  }

  await recordAttempt(admin, {
    businessId: business!.id,
    channel,
    eventId: event.id,
    failureReason,
    provider,
    providerMessageId,
    status,
  });
  await finalizeEvent(admin, {
    attemptCount: attemptBase + 1,
    eventId: event.id,
    failureReason,
    now,
    providerMessageId,
    status,
  });

  return status;
}

/**
 * Privacy-safe attempt record: only operational fields. No destination, no
 * rendered content, no raw provider response.
 */
async function recordAttempt(
  admin: SupabaseClient<Database>,
  {
    businessId,
    channel,
    eventId,
    failureReason,
    provider,
    providerMessageId,
    status,
  }: {
    businessId: string;
    channel: string;
    eventId: string;
    failureReason: string | null;
    provider: string;
    providerMessageId: string | null;
    status: NotificationStatus;
  },
) {
  await admin.from("notification_delivery_attempts").insert({
    business_id: businessId,
    channel: channel as Database["public"]["Enums"]["notification_channel"],
    failure_reason: failureReason,
    notification_event_id: eventId,
    provider,
    provider_message_id: providerMessageId,
    status,
  });
}

/**
 * Terminal update for a claimed event. Guarded on `status = 'processing'` so a
 * row that was not legitimately claimed is never transitioned, and the lock is
 * always cleared so nothing stays stuck.
 */
async function finalizeEvent(
  admin: SupabaseClient<Database>,
  {
    attemptCount,
    eventId,
    failureReason,
    now,
    providerMessageId,
    status,
  }: {
    attemptCount: number;
    eventId: string;
    failureReason: string | null;
    now: string;
    providerMessageId: string | null;
    status: NotificationStatus;
  },
) {
  await admin
    .from("notification_events")
    .update({
      attempt_count: attemptCount,
      failed_at: status === "failed" ? now : null,
      failure_reason: failureReason,
      last_attempt_at: now,
      locked_until: null,
      provider_message_id: providerMessageId,
      sent_at: status === "sent" ? now : null,
      status,
    })
    .eq("id", eventId)
    .eq("status", "processing");
}

export async function processQueuedNotifications(limit = 20): Promise<DispatchResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .rpc("claim_queued_notification_events", {
      p_limit: limit,
      p_lock_seconds: 300,
    });

  if (error) {
    return { attempted: 0, failed: 1, sent: 0, skipped: 0 };
  }

  const result: DispatchResult = { attempted: 0, failed: 0, sent: 0, skipped: 0 };
  for (const event of (data ?? []) as NotificationEventForDispatch[]) {
    result.attempted += 1;
    try {
      // The RPC sets 'processing' on every row it returns; anything else means
      // the row was not legitimately claimed.
      if (event.status !== undefined && !isClaimedProcessingStatus(event.status)) {
        console.error("notification dispatch denied", "unclaimed_status");
        result.skipped += 1;
        continue;
      }
      const status = await dispatchEvent(admin, event);
      statusCounts(result, status);
    } catch {
      // One poisoned row must never end the batch, and must never stay locked:
      // release it so it cannot block the queue, with its attempt counted.
      result.failed += 1;
      try {
        await admin
          .from("notification_events")
          .update({
            attempt_count: boundedAttemptCount(event.attempt_count) + 1,
            failure_reason: "dispatch_error",
            last_attempt_at: new Date().toISOString(),
            locked_until: null,
            status: "failed",
          })
          .eq("id", event.id)
          .eq("status", "processing");
      } catch {
        console.error("notification dispatch denied", "unlock_failed");
      }
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

    // In-app only: `push` rows feed the notification centre and are never
    // dispatched to a provider (the claim RPC selects email/sms only).
    // Identity comes from the verified quotation row, and the payload goes
    // through the same allowlist as every other queued event.
    const payload = persistablePayloadSchema.safeParse({
      quote_id: quote.id,
      quote_number: quote.quote_number,
      type: `quote_${decision}`,
    });
    if (!payload.success) {
      console.error("enqueueQuoteDecisionNotification rejected", "payload_invalid");
      return { inserted: 0, skipped: true };
    }

    await admin.from("notification_events").upsert(
      {
        business_id: quote.business_id,
        channel: IN_APP_CHANNEL,
        customer_id: quote.customer_id,
        dedupe_key: `quote_${decision}:${quote.id}:${IN_APP_CHANNEL}`,
        payload: payload.data,
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

export async function enqueueAppointmentDecisionNotification({
  appointmentId,
  declineReason,
  slotLabel,
  status,
}: {
  appointmentId: string;
  declineReason?: string;
  slotLabel?: string;
  status: "confirmed" | "declined";
}) {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("appointments")
      .select("id, business_id, customer_id")
      .eq("id", appointmentId)
      .maybeSingle();
    const appointment = data as
      | { business_id: string; customer_id: string; id: string }
      | null;
    if (!appointment) return { inserted: 0, skipped: true };

    const templateKey = status === "confirmed" ? "appointment_confirmed" : "appointment_declined";
    return queueCustomerNotification({
      businessId: appointment.business_id,
      customerId: appointment.customer_id,
      dedupeKey: `appointment_${status}:${appointment.id}`,
      payload: {
        appointment_id: appointment.id,
        decline_reason: declineReason ?? null,
        type: templateKey,
      },
      templateKey,
      variables: {
        slotLabel: slotLabel ?? "",
      },
    });
  } catch {
    return { inserted: 0, skipped: true };
  }
}

export async function enqueueInvoiceIssuedNotification(invoiceId: string) {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("invoices")
      .select("id, business_id, customer_id, invoice_number, total, currency")
      .eq("id", invoiceId)
      .maybeSingle();
    const invoice = data as
      | {
          business_id: string;
          currency: string;
          customer_id: string;
          id: string;
          invoice_number: string | null;
          total: number;
        }
      | null;
    if (!invoice?.invoice_number) return { inserted: 0, skipped: true };
    return queueCustomerNotification({
      businessId: invoice.business_id,
      customerId: invoice.customer_id,
      dedupeKey: `invoice_issued:${invoice.id}`,
      payload: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        type: "invoice_issued",
      },
      templateKey: "invoice_issued",
      variables: {
        currency: invoice.currency,
        invoiceNumber: invoice.invoice_number,
        total: invoice.total.toFixed(2),
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
