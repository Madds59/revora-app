import {
  handleMetaFamilyVerification,
  handleMetaFamilyWebhook,
} from "@/lib/inbound/handler";
import { normaliseMetaWebhook } from "@/lib/inbound/meta-payload.js";

/**
 * Instagram DMs, Facebook Messenger and Meta lead ads.
 *
 * All three arrive on one endpoint because Meta subscribes one callback URL
 * per app and fans every product's events through it. The normaliser sorts
 * messaging payloads from leadgen ones.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIG = {
  fallbackChannel: "instagram" as const,
  label: "inbound:meta",
  normalise: normaliseMetaWebhook,
};

export function GET(request: Request) {
  return handleMetaFamilyVerification(request, CONFIG);
}

export function POST(request: Request) {
  return handleMetaFamilyWebhook(request, CONFIG);
}
