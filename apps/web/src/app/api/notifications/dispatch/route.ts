import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { processQueuedNotifications } from "@/lib/notifications/service";

export const runtime = "nodejs";

/**
 * Constant-time shared-secret comparison, matching the discipline already used
 * by verifyStripeWebhookSignature in lib/stripe-webhook.ts. `!==` on a secret
 * short-circuits at the first differing byte; this route is unauthenticated
 * apart from this header (middleware skips /api), so it is the only gate on a
 * privileged, service-role notification drain.
 */
function secretMatches(provided: string | null, expected: string | undefined) {
  if (!expected || !provided) return false;
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

export async function POST(request: NextRequest) {
  if (process.env.NOTIFICATIONS_DISPATCH_ENABLED !== "true") {
    return NextResponse.json({
      attempted: 0,
      disabled: true,
      message: "Notification dispatch is disabled.",
    });
  }

  if (
    !secretMatches(
      request.headers.get("x-notification-dispatch-secret"),
      process.env.NOTIFICATIONS_DISPATCH_SECRET,
    )
  ) {
    return NextResponse.json(
      { error: "Notification dispatch is not authorized." },
      { status: 403 },
    );
  }

  const result = await processQueuedNotifications();
  return NextResponse.json(result);
}
