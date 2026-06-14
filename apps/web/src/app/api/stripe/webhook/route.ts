import { NextResponse } from "next/server";

import { stripeEnv } from "@/lib/env";
import {
  processStripeWebhookEvent,
  verifyStripeWebhookSignature,
} from "@/lib/stripe-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!stripeEnv.webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook secret is not configured." },
      { status: 500 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  const payload = await request.text();
  const verification = verifyStripeWebhookSignature(
    payload,
    signature,
    stripeEnv.webhookSecret,
  );

  if (!verification.ok) {
    return NextResponse.json(
      { error: "Invalid Stripe signature." },
      { status: 400 },
    );
  }

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid webhook body." }, { status: 400 });
  }

  if (!event || typeof event !== "object") {
    return NextResponse.json({ error: "Invalid webhook body." }, { status: 400 });
  }

  const stripeEvent = event as {
    id?: string;
    type?: string;
    data?: { object?: unknown };
  };

  if (!stripeEvent.id || !stripeEvent.type || !stripeEvent.data?.object) {
    return NextResponse.json({ error: "Incomplete Stripe event." }, { status: 400 });
  }

  try {
    const result = await processStripeWebhookEvent(
      stripeEvent as Parameters<typeof processStripeWebhookEvent>[0],
    );
    if ((result as { ignored?: boolean }).ignored) {
      return NextResponse.json({ received: true, ignored: true });
    }
    if ((result as { processed?: boolean }).processed === false) {
      return NextResponse.json({ received: true, skipped: true });
    }
    return NextResponse.json({ received: true, processed: true });
  } catch (error) {
    console.error("[stripe:webhook] processing failed", error);
    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
