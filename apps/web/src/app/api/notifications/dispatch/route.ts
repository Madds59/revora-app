import { NextRequest, NextResponse } from "next/server";

import { processQueuedNotifications } from "@/lib/notifications/service";

export async function POST(request: NextRequest) {
  if (process.env.NOTIFICATIONS_DISPATCH_ENABLED !== "true") {
    return NextResponse.json({
      attempted: 0,
      disabled: true,
      message: "Notification dispatch is disabled.",
    });
  }

  const expectedSecret = process.env.NOTIFICATIONS_DISPATCH_SECRET;
  const providedSecret = request.headers.get("x-notification-dispatch-secret");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json(
      { error: "Notification dispatch is not authorized." },
      { status: 403 },
    );
  }

  const result = await processQueuedNotifications();
  return NextResponse.json(result);
}
