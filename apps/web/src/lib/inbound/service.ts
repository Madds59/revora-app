import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type {
  DeliveryStatus,
  InboundChannel,
  NormalisedInboundItem,
} from "./types";

/**
 * Database side of inbound capture. SERVICE ROLE, deliberately.
 *
 * WHY THE SERVICE ROLE IS CORRECT HERE, and nowhere else in a request path
 * There is no session. The caller is Meta, not a user, so there is no JWT for
 * RLS to evaluate; inbound_webhook_events has RLS enabled with zero policies
 * precisely so that nothing BUT the service role can reach it. The safety
 * comes from the order of operations rather than from the key:
 *
 *   1. the raw delivery is recorded before anything is interpreted;
 *   2. the tenant is resolved by unique lookup against inbound_channel_routes;
 *   3. only then is a business_id used, and it is the resolved one — never a
 *      value taken from the payload.
 *
 * Step 3 is the invariant that matters. Every write below takes its
 * business_id from the resolved route, and the composite foreign keys in
 * migration 0048 refuse the row if it disagrees with the parent, on this path
 * as on every other.
 */

export type { DeliveryStatus };

export type DeliveryRecord = { id: string; duplicate: boolean };

export type ResolvedRoute = {
  routeId: string;
  businessId: string;
  branchId: string | null;
};

const UNIQUE_VIOLATION = "23505";

/**
 * Records one webhook delivery before tenant resolution.
 *
 * A unique violation on (channel, external_event_id) means the provider
 * redelivered: every channel here is at-least-once, so this is the normal
 * case, not an error. It returns `duplicate: true` and the caller stops.
 */
export async function recordDelivery(input: {
  channel: InboundChannel;
  externalEventId: string | null;
  signatureVerified: boolean;
  payload: unknown;
  status?: DeliveryStatus;
  errorMessage?: string | null;
}): Promise<DeliveryRecord | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("inbound_webhook_events")
    .insert({
      channel: input.channel,
      external_event_id: input.externalEventId,
      signature_verified: input.signatureVerified,
      payload: (input.payload ?? {}) as never,
      status: input.status ?? "received",
      error_message: input.errorMessage ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { id: "", duplicate: true };
    console.error("[inbound] failed to record delivery", error.message);
    return null;
  }
  return { id: data.id, duplicate: false };
}

/** Marks a recorded delivery with its outcome. Never throws into the route. */
export async function finaliseDelivery(
  deliveryId: string,
  status: DeliveryStatus,
  details?: { businessId?: string | null; routeId?: string | null; errorMessage?: string | null },
): Promise<void> {
  if (!deliveryId) return;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("inbound_webhook_events")
    .update({
      status,
      processed_at: new Date().toISOString(),
      resolved_business_id: details?.businessId ?? null,
      route_id: details?.routeId ?? null,
      error_message: details?.errorMessage ?? null,
    })
    .eq("id", deliveryId);
  if (error) console.error("[inbound] failed to finalise delivery", error.message);
}

/**
 * Resolves an external account id to exactly one tenant.
 *
 * The global unique on (channel, external_account_id) is what makes this a
 * lookup rather than a judgement, so `maybeSingle()` is correct: there can be
 * at most one row, and no row means the account is not onboarded.
 */
export async function resolveRoute(
  channel: InboundChannel,
  externalAccountId: string,
): Promise<ResolvedRoute | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("inbound_channel_routes")
    .select("id, business_id, branch_id")
    .eq("channel", channel)
    .eq("external_account_id", externalAccountId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[inbound] route lookup failed", error.message);
    return null;
  }
  if (!data) return null;
  return { routeId: data.id, businessId: data.business_id, branchId: data.branch_id };
}

/**
 * Finds or creates the channel identity for a sender, and refreshes
 * last_seen_at. Scoped by (business_id, channel, external_id), the table's own
 * unique key.
 */
async function upsertIdentity(
  route: ResolvedRoute,
  item: NormalisedInboundItem,
): Promise<string | null> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("channel_identities")
    .upsert(
      {
        business_id: route.businessId,
        channel: item.channel,
        external_id: item.externalId,
        external_handle: item.externalHandle,
        display_name: item.displayName,
        last_seen_at: now,
      },
      { onConflict: "business_id,channel,external_id" },
    )
    .select("id")
    .single();

  if (error) {
    console.error("[inbound] identity upsert failed", error.message);
    return null;
  }
  return data.id;
}

/** A lead is still "open" while it has not been converted or closed out. */
const OPEN_STATUSES = ["new", "triaging", "qualified", "booked"];

/**
 * Finds the open lead for this identity or creates one.
 *
 * Threading matters: a follow-up DM two minutes later is the same inquiry, and
 * creating a second lead per message would make the work queue unusable and
 * the conversion metrics wrong.
 */
async function findOrCreateLead(
  route: ResolvedRoute,
  item: NormalisedInboundItem,
  identityId: string | null,
): Promise<string | null> {
  const supabase = createAdminClient();

  if (identityId) {
    const { data, error } = await supabase
      .from("leads")
      .select("id")
      .eq("business_id", route.businessId)
      .eq("channel_identity_id", identityId)
      .in("status", OPEN_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[inbound] open-lead lookup failed", error.message);
      return null;
    }
    if (data) return data.id;
  }

  const { data, error } = await supabase
    .from("leads")
    .insert({
      business_id: route.businessId,
      branch_id: route.branchId,
      channel: item.channel,
      channel_identity_id: identityId,
      // The consumer's own words, untouched. AI-written fields (summary,
      // intent, urgency) stay null until Stage 1 classification runs.
      subject: item.text ? item.text.slice(0, 500) : null,
      status: "new",
      source_campaign_id: item.source.campaignId,
      source_ad_id: item.source.adId,
      source_form_id: item.source.formId,
      // Consent is NOT inferred from the act of messaging a business. A Meta
      // lead form carries its own explicit consent; a DM does not.
      marketing_consent: item.kind === "lead_form",
      consent_source: item.kind === "lead_form" ? "meta_lead_form" : null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[inbound] lead insert failed", error.message);
    return null;
  }
  return data.id;
}

/**
 * Appends the inbound turn. The partial unique on
 * (business_id, external_message_id) makes a redelivered message a no-op
 * rather than a duplicate turn, which is the second line of replay defence
 * after the delivery-level dedupe.
 */
async function appendMessage(
  route: ResolvedRoute,
  item: NormalisedInboundItem,
  leadId: string,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("lead_messages").insert({
    business_id: route.businessId,
    lead_id: leadId,
    direction: "inbound",
    author_type: "customer",
    body: item.text,
    external_message_id: item.externalMessageId,
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return true;
    console.error("[inbound] message insert failed", error.message);
    return false;
  }
  return true;
}

export type IngestOutcome = {
  ingested: number;
  unresolved: number;
  failed: number;
  businessIds: string[];
  routeIds: string[];
};

/**
 * Ingests a normalised batch. One delivery can legitimately carry items for
 * several accounts, so the route is resolved per item rather than once.
 */
export async function ingestItems(
  items: NormalisedInboundItem[],
): Promise<IngestOutcome> {
  const outcome: IngestOutcome = {
    ingested: 0,
    unresolved: 0,
    failed: 0,
    businessIds: [],
    routeIds: [],
  };
  const routeCache = new Map<string, ResolvedRoute | null>();

  for (const item of items) {
    const key = `${item.channel}:${item.externalAccountId}`;
    if (!routeCache.has(key)) {
      routeCache.set(key, await resolveRoute(item.channel, item.externalAccountId));
    }
    const route = routeCache.get(key) ?? null;

    if (!route) {
      outcome.unresolved += 1;
      continue;
    }
    if (!outcome.businessIds.includes(route.businessId)) {
      outcome.businessIds.push(route.businessId);
    }
    if (!outcome.routeIds.includes(route.routeId)) {
      outcome.routeIds.push(route.routeId);
    }

    const identityId = await upsertIdentity(route, item);
    const leadId = await findOrCreateLead(route, item, identityId);
    if (!leadId) {
      outcome.failed += 1;
      continue;
    }
    const appended = await appendMessage(route, item, leadId);
    if (appended) outcome.ingested += 1;
    else outcome.failed += 1;
  }

  return outcome;
}

/**
 * Rate limit for a public endpoint, via the SECURITY DEFINER limiter added in
 * 0044. The scope allowlist lives inside that function, so `inbound_ip` is
 * added by migration 0049 rather than passed as config.
 *
 * Fails OPEN on an RPC error, and only on an error: a limiter that is itself
 * broken must not silently drop a customer's first message to a business. It
 * returns false only when the limiter actually says the bucket is exhausted.
 */
export async function withinRateLimit(
  scope: "inbound_ip",
  identifier: string,
): Promise<boolean> {
  if (!identifier) return true;
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    scope,
    identifier,
  });
  if (error) {
    console.error("[inbound] rate limiter unavailable", error.message);
    return true;
  }
  return data !== false;
}
