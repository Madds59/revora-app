import "server-only";

import { NextResponse } from "next/server";

import { inboundEnv } from "@/lib/env";

import { deriveEventId } from "./meta-payload.js";
import type { InboundChannel, NormalisedInboundItem } from "./types";
import {
  finaliseDelivery,
  ingestItems,
  recordDelivery,
  withinRateLimit,
} from "./service";
import { verifyHubChallenge, verifyMetaSignature } from "./verify.js";

/**
 * The shared handler for every Meta-family inbound route.
 *
 * One audited implementation rather than four divergent ones: Instagram,
 * Messenger, Meta lead ads and the WhatsApp Cloud API share the signature
 * scheme and the handshake, and differ only in how a payload is normalised.
 * The per-route file supplies `normalise` and a fallback channel label and
 * nothing else.
 *
 * THE ORDER OF OPERATIONS IS THE DESIGN
 *   1. read the RAW body (not parsed: the HMAC covers exact bytes)
 *   2. verify the signature
 *   3. record the delivery, verified or not, before interpreting it
 *   4. resolve the tenant by unique lookup
 *   5. deduplicate
 *   6. write identity, lead and message under the RESOLVED business_id
 *
 * Step 4 before step 6 is what keeps an unresolvable payload out of
 * tenant-scoped storage. A payload that names no onboarded account is recorded
 * and dropped; nothing tenant-scoped is written.
 *
 * WHY 200 ON A REJECTED PAYLOAD
 * A bad signature or an unknown account returns 200 after the attempt is
 * recorded. Returning 4xx teaches the provider to retry a payload that will
 * never succeed, and a sustained error rate gets the webhook subscription
 * disabled — which would take the real traffic down with it. It also tells a
 * prober which account ids are live. The inbound_webhook_events row carries
 * the real outcome; the HTTP status is only an acknowledgement of receipt.
 */

export type MetaFamilyRouteConfig = {
  /** Channel recorded when the payload cannot be normalised to a known one. */
  fallbackChannel: InboundChannel;
  /** Log prefix, e.g. "inbound:meta". */
  label: string;
  normalise: (payload: unknown) => NormalisedInboundItem[];
};

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "";
  return request.headers.get("x-real-ip")?.trim() ?? "";
}

/**
 * GET: the one-time subscription handshake. The challenge is echoed as plain
 * text, which is what Meta expects, and only after the verify token matches.
 */
export function handleMetaFamilyVerification(
  request: Request,
  config: MetaFamilyRouteConfig,
): Response {
  const url = new URL(request.url);
  const result = verifyHubChallenge(
    {
      mode: url.searchParams.get("hub.mode"),
      verifyToken: url.searchParams.get("hub.verify_token"),
      challenge: url.searchParams.get("hub.challenge"),
    },
    inboundEnv.metaVerifyToken,
  );

  if (!result.ok) {
    console.warn(`[${config.label}] handshake refused: ${result.reason}`);
    // 403 is correct here, unlike on POST: this is an interactive, one-time
    // configuration step, not a delivery that would be retried.
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(result.challenge, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/** POST: a delivery. */
export async function handleMetaFamilyWebhook(
  request: Request,
  config: MetaFamilyRouteConfig,
): Promise<Response> {
  if (!inboundEnv.metaAppSecret) {
    // Misconfiguration, not a bad payload: 500 is right, and a retry after the
    // secret is set will succeed.
    console.error(`[${config.label}] META_APP_SECRET is not configured`);
    return NextResponse.json(
      { error: "Inbound webhooks are not configured." },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const verification = verifyMetaSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
    inboundEnv.metaAppSecret,
  );

  if (!verification.ok) {
    // Rate limiting applies ONLY to the unverified path. A valid HMAC proves
    // the caller holds the app secret, so there is nothing to throttle; the
    // abuse case is someone hammering a public URL with junk, and that is
    // exactly what lands here. Limiting the verified path by IP would throttle
    // Meta's own egress addresses, which carry every tenant's real traffic.
    const ip = clientIp(request);
    const allowed = await withinRateLimit("inbound_ip", ip);
    if (!allowed) {
      console.warn(`[${config.label}] unsigned request rate-limited`);
      return NextResponse.json({ received: false }, { status: 429 });
    }
    await recordDelivery({
      channel: config.fallbackChannel,
      externalEventId: null,
      signatureVerified: false,
      payload: { reason: verification.reason },
      status: "bad_signature",
      errorMessage: verification.reason,
    });
    console.warn(`[${config.label}] signature rejected: ${verification.reason}`);
    return NextResponse.json({ received: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await recordDelivery({
      channel: config.fallbackChannel,
      externalEventId: null,
      signatureVerified: true,
      payload: {},
      status: "rejected",
      errorMessage: "invalid_json",
    });
    return NextResponse.json({ received: true });
  }

  const items = config.normalise(payload);
  const channel = items[0]?.channel ?? config.fallbackChannel;
  const delivery = await recordDelivery({
    channel,
    externalEventId: deriveEventId(items),
    signatureVerified: true,
    payload,
  });

  if (!delivery) {
    // The delivery could not even be recorded, so this is our fault and the
    // provider should retry.
    return NextResponse.json({ error: "Could not record delivery." }, { status: 500 });
  }
  if (delivery.duplicate) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (items.length === 0) {
    // Signed and well-formed, but nothing actionable: a read receipt, a
    // status update, or an echo of our own outbound message. Acknowledged and
    // recorded, not an error.
    await finaliseDelivery(delivery.id, "processed");
    return NextResponse.json({ received: true, ingested: 0 });
  }

  const outcome = await ingestItems(items);

  if (outcome.ingested === 0 && outcome.unresolved > 0) {
    await finaliseDelivery(delivery.id, "unresolved_tenant", {
      errorMessage: `no active route for ${outcome.unresolved} item(s)`,
    });
    console.warn(`[${config.label}] no route for ${outcome.unresolved} item(s)`);
    return NextResponse.json({ received: true, ingested: 0 });
  }

  await finaliseDelivery(
    delivery.id,
    outcome.failed > 0 ? "rejected" : "processed",
    {
      businessId: outcome.businessIds[0] ?? null,
      routeId: outcome.routeIds[0] ?? null,
      errorMessage: outcome.failed > 0 ? `${outcome.failed} item(s) failed` : null,
    },
  );

  return NextResponse.json({
    received: true,
    ingested: outcome.ingested,
    unresolved: outcome.unresolved,
    failed: outcome.failed,
  });
}
