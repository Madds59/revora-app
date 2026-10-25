
/**
 * Labels and badge variants for the inbound lead work queue.
 *
 * Mirrors lib/complaints.ts: the status and channel vocabularies come from
 * migration 0048 (a text domain with a check constraint for status and
 * urgency, the inbound_channel enum for channels), and each gets an EN and AR
 * label plus a badge variant so the list and the thread render the same way.
 *
 * Kept free of Supabase and React so `node --test` can assert that every
 * database value has a label -- the failure mode otherwise is a blank badge
 * for a status nobody thought about.
 */

/** Matches the leads_status_check constraint in 0048. */
export const LEAD_STATUSES = [
  "new",
  "triaging",
  "qualified",
  "booked",
  "converted",
  "lost",
  "spam",
  "duplicate",
];


/** Matches the leads_urgency_check constraint in 0048. */
export const LEAD_URGENCIES = [
  "unknown",
  "low",
  "medium",
  "high",
  "critical",
];


/** Matches the inbound_channel enum in 0048. */
export const LEAD_CHANNELS = [
  "instagram",
  "facebook",
  "whatsapp",
  "tiktok",
  "meta_lead_ad",
  "voice",
  "sms",
  "email",
  "web_chat",
  "web_form",
];

/**
 * Statuses that keep a lead in the queue. The inbound route reuses an open
 * lead rather than creating a second one per message, so this list and the
 * OPEN_STATUSES in lib/inbound/service.ts describe the same idea; `booked` is
 * open in both because the job has not been created yet.
 */
export const OPEN_LEAD_STATUSES = [
  "new",
  "triaging",
  "qualified",
  "booked",
];

/** @type {Record<string, string>} */
const LEAD_STATUS_LABELS_EN = {
  new: "New",
  triaging: "Triaging",
  qualified: "Qualified",
  booked: "Booked",
  converted: "Converted",
  lost: "Lost",
  spam: "Spam",
  duplicate: "Duplicate",
};

/** @type {Record<string, string>} */
const LEAD_STATUS_LABELS_AR = {
  new: "جديد",
  triaging: "قيد الفرز",
  qualified: "مؤهل",
  booked: "محجوز",
  converted: "محوّل",
  lost: "مفقود",
  spam: "غير مرغوب",
  duplicate: "مكرر",
};

/** @type {Record<string, string>} */
const LEAD_URGENCY_LABELS_EN = {
  unknown: "Unknown",
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/** @type {Record<string, string>} */
const LEAD_URGENCY_LABELS_AR = {
  unknown: "غير محدد",
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  critical: "حرجة",
};

/** @type {Record<string, string>} */
const LEAD_CHANNEL_LABELS_EN = {
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  tiktok: "TikTok",
  meta_lead_ad: "Meta lead ad",
  voice: "Phone call",
  sms: "SMS",
  email: "Email",
  web_chat: "Web chat",
  web_form: "Web form",
};

/** @type {Record<string, string>} */
const LEAD_CHANNEL_LABELS_AR = {
  instagram: "إنستغرام",
  facebook: "فيسبوك",
  whatsapp: "واتساب",
  tiktok: "تيك توك",
  meta_lead_ad: "إعلان ميتا",
  voice: "اتصال هاتفي",
  sms: "رسالة نصية",
  email: "بريد إلكتروني",
  web_chat: "محادثة الموقع",
  web_form: "نموذج الموقع",
};

/** @type {Record<string, import("./leads-types").BadgeVariant>} */
export const LEAD_STATUS_VARIANT = {
  new: "default",
  triaging: "secondary",
  qualified: "secondary",
  booked: "secondary",
  converted: "outline",
  lost: "outline",
  spam: "destructive",
  duplicate: "outline",
};

/** @type {Record<string, import("./leads-types").BadgeVariant>} */
export const LEAD_URGENCY_VARIANT = {
  unknown: "outline",
  low: "outline",
  medium: "secondary",
  high: "default",
  critical: "destructive",
};

/**
 * @param {string} status
 * @param {"en" | "ar"} [locale]
 * @returns {string}
 */
export function getLeadStatusLabel(status, locale = "en") {
  return locale === "ar" ? LEAD_STATUS_LABELS_AR[status] : LEAD_STATUS_LABELS_EN[status];
}

/**
 * @param {string} urgency
 * @param {"en" | "ar"} [locale]
 * @returns {string}
 */
export function getLeadUrgencyLabel(urgency, locale = "en") {
  return locale === "ar"
    ? LEAD_URGENCY_LABELS_AR[urgency]
    : LEAD_URGENCY_LABELS_EN[urgency];
}

/**
 * @param {string} channel
 * @param {"en" | "ar"} [locale]
 * @returns {string}
 */
export function getLeadChannelLabel(channel, locale = "en") {
  return locale === "ar"
    ? LEAD_CHANNEL_LABELS_AR[channel]
    : LEAD_CHANNEL_LABELS_EN[channel];
}

/**
 * The display name for whoever sent the inquiry. A stranger on a channel has
 * no customer record and often no profile name either, so this degrades:
 * linked customer, then channel display name, then the handle, then a generic
 * label. It never returns the raw external id, which is a provider-scoped
 * identifier and meaningless to staff.
 */
/**
 * @param {{ customer_name?: string | null, identity_display_name?: string | null, identity_handle?: string | null }} lead
 * @param {string} [fallback]
 * @returns {string}
 */
export function getLeadContactLabel(lead, fallback = "Unknown contact") {
  return (
    lead.customer_name?.trim() ||
    lead.identity_display_name?.trim() ||
    lead.identity_handle?.trim() ||
    fallback
  );
}

export const LEAD_STATUS_LABELS = LEAD_STATUS_LABELS_EN;
export const LEAD_CHANNEL_LABELS = LEAD_CHANNEL_LABELS_EN;
export const LEAD_URGENCY_LABELS = LEAD_URGENCY_LABELS_EN;
