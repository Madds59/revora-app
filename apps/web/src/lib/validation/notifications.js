// Notification queue/dispatch validation (APPSEC-09 Phase 4C).
//
// WHY THIS EXISTS
// The notification service runs entirely on `createAdminClient()` (service role)
// and pulls work from a SECURITY DEFINER claim RPC. Neither the service role nor
// the RPC proves that a stored row is *correctly scoped*: the RPC selects rows by
// channel/status/schedule only, and returns whatever `recipient_email`,
// `recipient_phone`, `channel`, `template_key`, `locale` and `payload` happen to
// be on the row.
//
// So a stored row that is wrong — poisoned by any future write path, or simply
// stale after a customer changed address or was reassigned — would be dispatched
// verbatim to whatever destination it carries. That is the same class of bug as
// the Phase 4A evidence signing gap: data that has crossed into the database is
// still untrusted when it crosses back out through a privileged boundary.
//
// This module therefore provides pure, testable authorization for BOTH sides:
//   * queue time  — what may be written into notification_events
//   * dispatch time — what may be sent, re-derived from freshly verified rows
//
// Destinations are NEVER taken from the stored row. They are re-derived from the
// customer record that was just loaded under the event's business.

import { z } from "zod";

import {
  NOTIFICATION_TEMPLATE_KEYS,
  normalizeNotificationLocale,
} from "../notifications/templates.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;

/**
 * Channels the dispatcher may ever send on. This mirrors the claim RPC, which
 * selects `channel in ('email','sms')`. `push` rows are the in-app notification
 * centre and are deliberately NOT dispatchable — the enum also contains social
 * channels that the product does not implement, and none are added here.
 */
export const DISPATCHABLE_CHANNELS = ["email", "sms"];

/** In-app only; queued for the notification centre, never sent to a provider. */
export const IN_APP_CHANNEL = "push";

/**
 * Which source resource each template belongs to, and which payload id must
 * match it. Used to prove a queued row refers to a resource in its own business.
 */
export const TEMPLATE_SOURCES = {
  quote_sent: { table: "quotations", payloadKey: "quote_id" },
  quote_approved: { table: "quotations", payloadKey: "quote_id" },
  quote_rejected: { table: "quotations", payloadKey: "quote_id" },
  job_status_changed: { table: "jobs", payloadKey: "job_id" },
  job_completed: { table: "jobs", payloadKey: "job_id" },
  complaint_submitted: { table: "complaints", payloadKey: "complaint_id" },
  complaint_status_changed: { table: "complaints", payloadKey: "complaint_id" },
  feedback_submitted: { table: null, payloadKey: null },
  vehicle_safety_critical: { table: null, payloadKey: null },
  appointment_confirmed: { table: "appointments", payloadKey: "appointment_id" },
  appointment_declined: { table: "appointments", payloadKey: "appointment_id" },
  invoice_issued: { table: "invoices", payloadKey: "invoice_id" },
  // Maintenance reminders are addressed about a vehicle, so the vehicle is the
  // resource whose tenancy must be proven before the message goes out.
  maintenance_reminder_upcoming: { table: "vehicles", payloadKey: "vehicle_id" },
  maintenance_reminder_due: { table: "vehicles", payloadKey: "vehicle_id" },
};

export function isDispatchableChannel(value) {
  return typeof value === "string" && DISPATCHABLE_CHANNELS.includes(value);
}

export function isKnownTemplateKey(value) {
  return typeof value === "string" && NOTIFICATION_TEMPLATE_KEYS.includes(value);
}

// --- destinations -----------------------------------------------------------
// Validation proves SHAPE only. Ownership always comes from the verified
// customer row, never from the destination string itself.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns the trimmed address, or null when it is unusable. */
export function normalizeEmailDestination(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 320) return null;
  if (CONTROL_CHARS_RE.test(trimmed)) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

/**
 * Country-agnostic, matching the customer-facing phone rule from Phase 3:
 * international notation is preserved verbatim and never coerced to a number.
 */
const PHONE_RE = /^[+()\d][-+()\d\s./]*$/;

export function normalizePhoneDestination(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 32) return null;
  if (CONTROL_CHARS_RE.test(trimmed)) return null;
  if (!PHONE_RE.test(trimmed)) return null;
  if ((trimmed.match(/\d/g) ?? []).length < 5) return null;
  return trimmed;
}

/** Bounded display name; never used for authorization. */
export function normalizeRecipientName(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0 || CONTROL_CHARS_RE.test(trimmed)) return null;
  return trimmed.slice(0, 200);
}

// --- queue-time schema ------------------------------------------------------

const boundedText = (max) => z.string().trim().max(max);

/**
 * Template variables are rendered into message bodies. Only bounded scalars are
 * allowed — objects, arrays and functions cannot enter a template.
 */
const templateVariables = z.record(
  z.string().max(64),
  z.union([boundedText(500), z.number().finite(), z.null()]),
);

export const queueCustomerNotificationSchema = z.object({
  businessId: z.string().regex(UUID_RE, "Invalid business reference."),
  customerId: z.string().regex(UUID_RE, "Invalid customer reference."),
  templateKey: z
    .string()
    .refine(isKnownTemplateKey, "Unsupported notification template."),
  dedupeKey: z
    .string()
    .trim()
    .min(1, "Invalid notification key.")
    .max(200, "Invalid notification key.")
    .refine((v) => !CONTROL_CHARS_RE.test(v), "Invalid notification key."),
  channels: z
    .array(z.string())
    .optional()
    .transform((list) => (list ?? DISPATCHABLE_CHANNELS).filter(isDispatchableChannel)),
  payload: z.record(z.string().max(64), z.unknown()).optional(),
  variables: templateVariables.optional(),
});

/**
 * Payload actually persisted on the event. Only allowlisted keys survive —
 * anything a caller adds beyond this is dropped rather than stored, so no
 * secret, Storage path, signed URL or arbitrary URL can ride along.
 */
export const persistablePayloadSchema = z.object({
  type: boundedText(64).optional(),
  quote_id: z.string().regex(UUID_RE).optional(),
  quote_number: boundedText(64).optional(),
  job_id: z.string().regex(UUID_RE).optional(),
  job_title: boundedText(200).optional(),
  complaint_id: z.string().regex(UUID_RE).optional(),
  subject: boundedText(200).optional(),
  status: boundedText(64).optional(),
  // Resource ids for the invoicing and appointment templates. These must
  // survive the allowlist: TEMPLATE_SOURCES reads them back at dispatch to
  // prove the resource belongs to the event's business, so stripping them
  // would make that check fail closed on every send.
  invoice_id: z.string().regex(UUID_RE).optional(),
  invoice_number: boundedText(64).optional(),
  appointment_id: z.string().regex(UUID_RE).optional(),
  vehicle_id: z.string().regex(UUID_RE).optional(),
  maintenance_plan_id: z.string().regex(UUID_RE).optional(),
  business_name: boundedText(200).optional(),
  customer_name: boundedText(200).optional(),
  template_variables: templateVariables.optional(),
});

// --- dispatch-time (stored row) schema --------------------------------------

/**
 * A row handed back by the claim RPC. Parsed strictly before anything else
 * happens: an unparseable row is a poisoned row and must not be dispatched.
 */
export const claimedEventSchema = z.object({
  id: z.string().regex(UUID_RE),
  business_id: z.string().regex(UUID_RE),
  customer_id: z.string().regex(UUID_RE).nullable().optional(),
  channel: z.string(),
  template_key: z.string(),
  payload: z.unknown().optional(),
  locale: z.string().nullable().optional(),
  dedupe_key: z.string().nullable().optional(),
  attempt_count: z.number().int().nonnegative().nullable().optional(),
  // recipient_* are intentionally NOT part of the authorization surface. They
  // are accepted so the row parses, then ignored — destinations are re-derived.
  recipient_email: z.unknown().optional(),
  recipient_phone: z.unknown().optional(),
  recipient_name: z.unknown().optional(),
  status: z.string().nullable().optional(),
});

/** Attempt counts are clamped so a poisoned counter cannot run away. */
export const MAX_ATTEMPTS = 5;

export function boundedAttemptCount(value) {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
  if (n < 0) return 0;
  if (n > MAX_ATTEMPTS) return MAX_ATTEMPTS;
  return n;
}

/**
 * Authorize a claimed row for dispatch.
 *
 * `business` and `customer` MUST be rows just re-loaded by the caller — the
 * customer under the event's own `business_id`. `sourceMatches` is the caller's
 * verified answer to "does the payload's source resource belong to this
 * business (and customer, where the schema links one)?", or `null` when the
 * template has no source resource.
 *
 * Returns a decision carrying the RE-DERIVED destination. Nothing from the
 * stored row's recipient columns is ever propagated.
 */
export function authorizeEventForDispatch({
  event,
  business,
  customer,
  sourceMatches,
}) {
  const parsed = claimedEventSchema.safeParse(event);
  if (!parsed.success) return { allowed: false, code: "event_malformed" };
  const row = parsed.data;

  if (!isDispatchableChannel(row.channel)) {
    return { allowed: false, code: "channel_not_dispatchable" };
  }
  if (!isKnownTemplateKey(row.template_key)) {
    return { allowed: false, code: "template_unknown" };
  }

  if (!business || business.id !== row.business_id) {
    return { allowed: false, code: "business_unverified" };
  }

  // Customer-addressed channels require a live customer in THIS business.
  if (!row.customer_id) return { allowed: false, code: "recipient_unresolved" };
  if (!customer || customer.id !== row.customer_id) {
    return { allowed: false, code: "customer_unverified" };
  }
  if (customer.business_id && customer.business_id !== row.business_id) {
    return { allowed: false, code: "customer_business_mismatch" };
  }

  // The source resource must live in the same business as the event.
  const source = TEMPLATE_SOURCES[row.template_key];
  if (source?.table) {
    if (sourceMatches !== true) return { allowed: false, code: "source_unverified" };
  }

  // Destination is re-derived from the verified customer — the stored
  // recipient_email / recipient_phone columns are deliberately ignored.
  const destination =
    row.channel === "email"
      ? normalizeEmailDestination(customer.email)
      : normalizePhoneDestination(customer.phone);
  if (!destination) return { allowed: false, code: "recipient_unresolved" };

  const payload = persistablePayloadSchema.safeParse(
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? row.payload
      : {},
  );
  if (!payload.success) return { allowed: false, code: "payload_invalid" };

  const attemptCount = boundedAttemptCount(row.attempt_count ?? 0);
  if (attemptCount >= MAX_ATTEMPTS) {
    return { allowed: false, code: "attempts_exhausted", attemptCount };
  }

  return {
    allowed: true,
    channel: row.channel,
    templateKey: row.template_key,
    // Locale follows the verified customer first, then the row, then the default.
    locale: normalizeNotificationLocale(customer.preferred_language ?? row.locale ?? "en"),
    destination,
    recipientName: normalizeRecipientName(customer.full_name),
    variables: payload.data.template_variables ?? {},
    attemptCount,
  };
}

// --- provider failure normalization -----------------------------------------

/**
 * Raw provider responses must never be stored or logged: they can echo the
 * destination, quote message content, or provider account details. Everything is
 * reduced to a stable internal category.
 */
export const PROVIDER_FAILURE_CATEGORIES = [
  "provider_rejected",
  "provider_unavailable",
  "provider_auth",
  "provider_rate_limited",
  "provider_timeout",
  "provider_unknown",
];

export function normalizeProviderFailure(httpStatus) {
  if (typeof httpStatus !== "number" || !Number.isFinite(httpStatus)) {
    return "provider_unknown";
  }
  if (httpStatus === 401 || httpStatus === 403) return "provider_auth";
  if (httpStatus === 408 || httpStatus === 504) return "provider_timeout";
  if (httpStatus === 429) return "provider_rate_limited";
  if (httpStatus >= 500) return "provider_unavailable";
  if (httpStatus >= 400) return "provider_rejected";
  return "provider_unknown";
}

/** Provider message ids are opaque handles, never authorization input. */
export function normalizeProviderMessageId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return null;
  if (CONTROL_CHARS_RE.test(trimmed)) return null;
  return trimmed;
}

// --- delivery state ---------------------------------------------------------

/** Statuses the dispatcher may write, taken from the repository's own set. */
export const TERMINAL_SENT_STATUS = "sent";
export const RETRYABLE_STATUS = "failed";
export const SKIPPED_STATUSES = [
  "skipped_disabled",
  "skipped_missing_recipient",
  "skipped_no_provider",
  "skipped_suppressed",
];

/**
 * A claimed row must be in `processing` (the claim RPC sets it). Anything else
 * means the row was not legitimately claimed and must not be dispatched.
 */
export function isClaimedProcessingStatus(status) {
  return status === "processing";
}
