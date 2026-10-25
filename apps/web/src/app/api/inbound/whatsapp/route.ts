import {
  handleMetaFamilyVerification,
  handleMetaFamilyWebhook,
} from "@/lib/inbound/handler";
import { normaliseWhatsApp } from "@/lib/inbound/meta-payload.js";

/**
 * WhatsApp Cloud API.
 *
 * A separate endpoint from the Meta route even though the signature scheme is
 * identical, because the body shape and the tenant key differ: the tenant comes
 * from `value.metadata.phone_number_id`, not from the entry id, which is the
 * WhatsApp Business Account and can cover several numbers.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIG = {
  fallbackChannel: "whatsapp" as const,
  label: "inbound:whatsapp",
  normalise: normaliseWhatsApp,
};

export function GET(request: Request) {
  return handleMetaFamilyVerification(request, CONFIG);
}

export function POST(request: Request) {
  return handleMetaFamilyWebhook(request, CONFIG);
}
