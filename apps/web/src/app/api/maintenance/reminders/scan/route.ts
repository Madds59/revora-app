import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runMaintenanceReminderScan } from "@/lib/maintenance/scanner";

export const runtime = "nodejs";
// The scan reads live data and queues messages; a cached response would be
// both wrong and a way to skip the work entirely.
export const dynamic = "force-dynamic";

const HEADER_NAME = "x-maintenance-scan-secret";

/**
 * Daily maintenance reminder scan.
 *
 * GET and POST are both accepted for one concrete reason: Vercel Cron invokes
 * endpoints with GET and `Authorization: Bearer $CRON_SECRET`, while an
 * operator or an external scheduler uses POST with the route-specific header.
 * Middleware skips /api, so the shared secret is the only gate (see
 * lib/cron-auth.ts for the constant-time comparison).
 */
async function handle(request: NextRequest) {
  if (process.env.MAINTENANCE_REMINDERS_ENABLED !== "true") {
    return NextResponse.json({
      disabled: true,
      message: "Maintenance reminders are disabled.",
    });
  }

  if (
    !isAuthorizedCronRequest(request, {
      headerName: HEADER_NAME,
      headerSecret: process.env.MAINTENANCE_SCAN_SECRET,
    })
  ) {
    // Deliberately terse: no hint about which secret was wrong or missing.
    return NextResponse.json(
      { error: "Maintenance scan is not authorized." },
      { status: 403 },
    );
  }

  const summary = await runMaintenanceReminderScan();
  return NextResponse.json(summary);
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
