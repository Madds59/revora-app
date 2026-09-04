import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { processQueuedNotifications } from "@/lib/notifications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

/**
 * Vercel Cron invokes endpoints with GET and `Authorization: Bearer
 * $CRON_SECRET`. Before this, the only trigger was a manual POST carrying
 * x-notification-dispatch-secret, so queued transactional notifications
 * (quote sent, invoice issued, appointment confirmed) were never delivered on
 * a schedule at all. GET accepts the platform bearer convention in addition to
 * the existing header; POST is unchanged.
 */
export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
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
    ) &&
    !isAuthorizedCronRequest(request, {
      headerName: "x-notification-dispatch-secret",
      headerSecret: process.env.NOTIFICATIONS_DISPATCH_SECRET,
    })
  ) {
    return NextResponse.json(
      { error: "Notification dispatch is not authorized." },
      { status: 403 },
    );
  }

  const result = await processQueuedNotifications();
  return NextResponse.json(result);
}
