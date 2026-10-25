/**
 * Normalisers for Meta-family webhook payloads.
 *
 * Pure: takes already-parsed JSON of unknown shape and returns a
 * channel-agnostic list. Never throws — a webhook handler that throws on an
 * unfamiliar payload returns 5xx, and every provider here retries on non-2xx
 * and eventually disables a flapping endpoint. An unrecognised shape yields an
 * empty list, which the caller records and acknowledges.
 *
 * All four Meta surfaces share one signature scheme but NOT one body shape:
 *
 *   Instagram DM / Messenger   object: "instagram" | "page", entry[].messaging[]
 *   Meta lead ads              object: "page",  entry[].changes[] field "leadgen"
 *   WhatsApp Cloud API         object: "whatsapp_business_account",
 *                              entry[].changes[] field "messages"
 *
 * The tenant-resolution key differs per surface and is the part most easily
 * got wrong, so each normaliser states which field it uses.
 */

/**
 * @typedef {import("./types").InboundChannel} InboundChannel
 * @typedef {import("./types").NormalisedInboundItem} NormalisedInboundItem
 */

const NO_SOURCE = {
  campaignId: null,
  adId: null,
  formId: null,
  leadgenId: null,
};

/**
 * @param {unknown} value
 * @returns {Record<string, unknown> | null}
 */
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : null;
}

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Numeric ids arrive as numbers in some Meta payloads and strings in others. */
/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asId(value) {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Instagram DMs and Messenger. Tenant key: `entry[].id` — the IG account id or
 * the Facebook page id.
 *
 * Echoes are dropped. When the business replies through the Send API, Meta
 * delivers that outbound message back on the same webhook with
 * `message.is_echo = true`; treating it as inbound would post the business's
 * own reply into the thread a second time and, worse, could start a loop with
 * an auto-responder.
 *
 * Read receipts (`delivery`, `read`) and postbacks carry no message body and
 * are skipped here rather than becoming empty leads.
 */
/**
 * @param {unknown} payload
 * @returns {NormalisedInboundItem[]}
 */
export function normaliseMetaMessaging(payload) {
  const root = asRecord(payload);
  if (!root) return [];

  const object = asString(root.object);
  /** @type {InboundChannel | null} */
  const channel =
    object === "instagram" ? "instagram" : object === "page" ? "facebook" : null;
  if (!channel) return [];

  /** @type {NormalisedInboundItem[]} */
  const items = [];

  for (const rawEntry of asArray(root.entry)) {
    const entry = asRecord(rawEntry);
    if (!entry) continue;
    const accountId = asId(entry.id);
    if (!accountId) continue;

    for (const rawEvent of asArray(entry.messaging)) {
      const event = asRecord(rawEvent);
      if (!event) continue;

      const message = asRecord(event.message);
      if (!message) continue;
      if (message.is_echo === true) continue;

      const sender = asRecord(event.sender);
      const senderId = sender ? asId(sender.id) : null;
      if (!senderId) continue;

      const text = asString(message.text);
      const mid = asString(message.mid);
      // An attachment-only message has no text but is still a real inquiry.
      const hasAttachments = asArray(message.attachments).length > 0;
      if (!text && !hasAttachments) continue;

      items.push({
        channel,
        externalAccountId: accountId,
        externalId: senderId,
        externalHandle: null,
        displayName: null,
        externalMessageId: mid,
        text,
        kind: "message",
        source: { ...NO_SOURCE },
      });
    }
  }

  return items;
}

/**
 * Meta lead ads. Tenant key: `entry[].id` — the page id.
 *
 * The webhook carries only identifiers: leadgen_id, form_id, ad_id,
 * campaign_id. The submitted FIELD VALUES (name, phone, vehicle) are not in
 * the payload and require a Graph API call with that page's access token.
 * This normaliser therefore produces a lead with attribution and no contact
 * detail, and `externalId` falls back to the leadgen id so the record is still
 * uniquely identifiable. Fetching the field data is a separate, credentialed
 * step and is deliberately not faked here.
 */
/**
 * @param {unknown} payload
 * @returns {NormalisedInboundItem[]}
 */
export function normaliseMetaLeadgen(payload) {
  const root = asRecord(payload);
  if (!root) return [];
  if (asString(root.object) !== "page") return [];

  /** @type {NormalisedInboundItem[]} */
  const items = [];

  for (const rawEntry of asArray(root.entry)) {
    const entry = asRecord(rawEntry);
    if (!entry) continue;
    const accountId = asId(entry.id);
    if (!accountId) continue;

    for (const rawChange of asArray(entry.changes)) {
      const change = asRecord(rawChange);
      if (!change || asString(change.field) !== "leadgen") continue;
      const value = asRecord(change.value);
      if (!value) continue;

      const leadgenId = asId(value.leadgen_id);
      if (!leadgenId) continue;

      items.push({
        channel: "meta_lead_ad",
        externalAccountId: accountId,
        externalId: leadgenId,
        externalHandle: null,
        displayName: null,
        externalMessageId: leadgenId,
        text: null,
        kind: "lead_form",
        source: {
          campaignId: asId(value.campaign_id),
          adId: asId(value.ad_id),
          formId: asId(value.form_id),
          leadgenId,
        },
      });
    }
  }

  return items;
}

/**
 * WhatsApp Cloud API. Tenant key: `value.metadata.phone_number_id` — NOT the
 * entry id, which is the WhatsApp Business Account id and can cover several
 * numbers.
 *
 * `value.statuses` (sent/delivered/read receipts for our own outbound) is
 * ignored: those carry a wamid and would otherwise be mistaken for inbound
 * traffic and create an empty lead per delivery receipt.
 */
/**
 * @param {unknown} payload
 * @returns {NormalisedInboundItem[]}
 */
export function normaliseWhatsApp(payload) {
  const root = asRecord(payload);
  if (!root) return [];
  if (asString(root.object) !== "whatsapp_business_account") return [];

  /** @type {NormalisedInboundItem[]} */
  const items = [];

  for (const rawEntry of asArray(root.entry)) {
    const entry = asRecord(rawEntry);
    if (!entry) continue;

    for (const rawChange of asArray(entry.changes)) {
      const change = asRecord(rawChange);
      if (!change || asString(change.field) !== "messages") continue;
      const value = asRecord(change.value);
      if (!value) continue;

      const metadata = asRecord(value.metadata);
      const accountId = metadata ? asId(metadata.phone_number_id) : null;
      if (!accountId) continue;

      // Profile names arrive in a parallel `contacts` array keyed by wa_id.
      /** @type {Map<string, string>} */
      const names = new Map();
      for (const rawContact of asArray(value.contacts)) {
        const contact = asRecord(rawContact);
        if (!contact) continue;
        const waId = asId(contact.wa_id);
        const profile = asRecord(contact.profile);
        const name = profile ? asString(profile.name) : null;
        if (waId && name) names.set(waId, name);
      }

      for (const rawMessage of asArray(value.messages)) {
        const message = asRecord(rawMessage);
        if (!message) continue;

        const from = asId(message.from);
        const wamid = asString(message.id);
        if (!from) continue;

        const textBlock = asRecord(message.text);
        const text = textBlock ? asString(textBlock.body) : null;
        const type = asString(message.type);
        // Keep non-text messages (image, audio, document): an attachment-only
        // message is still an inquiry. Only drop types with no payload at all.
        if (!text && !type) continue;

        items.push({
          channel: "whatsapp",
          externalAccountId: accountId,
          externalId: from,
          externalHandle: from,
          displayName: names.get(from) ?? null,
          externalMessageId: wamid,
          text,
          kind: "message",
          source: { ...NO_SOURCE },
        });
      }
    }
  }

  return items;
}

/** Meta route: messaging and lead-ad payloads arrive on the same endpoint. */
/**
 * @param {unknown} payload
 * @returns {NormalisedInboundItem[]}
 */
export function normaliseMetaWebhook(payload) {
  return [...normaliseMetaMessaging(payload), ...normaliseMetaLeadgen(payload)];
}

/**
 * Provider event id for the delivery-level dedupe on inbound_webhook_events.
 * Meta does not send one, so it is derived from the normalised items: the
 * first message/leadgen id in the batch, which is stable across redeliveries
 * of the same batch. Null when nothing identifiable was found, in which case
 * the delivery is recorded without dedupe rather than dropped.
 */
/**
 * @param {NormalisedInboundItem[]} items
 * @returns {string | null}
 */
export function deriveEventId(items) {
  for (const item of items) {
    if (item.externalMessageId) return item.externalMessageId;
  }
  return null;
}
