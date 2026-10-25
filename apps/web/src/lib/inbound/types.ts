/**
 * Shared types for inbound capture. Mirrors the `inbound_channel` enum added
 * by migration 0048.
 *
 * These live in a .ts file while the pure logic lives in .js, matching the
 * convention established by lib/vehicle-intelligence and lib/notifications:
 * `tsconfig.json` includes only **\/*.ts and **\/*.tsx, so a .js module stays
 * importable from `node --test` without a build step, and its types are
 * declared here for the TypeScript callers.
 */

export type InboundChannel =
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "tiktok"
  | "meta_lead_ad"
  | "voice"
  | "sms"
  | "email"
  | "web_chat"
  | "web_form";

export type InboundItemKind = "message" | "lead_form";

export type InboundAttribution = {
  campaignId: string | null;
  adId: string | null;
  formId: string | null;
  leadgenId: string | null;
};

export type NormalisedInboundItem = {
  channel: InboundChannel;
  /** Resolves the tenant via inbound_channel_routes. */
  externalAccountId: string;
  /** Stable per-provider sender id: PSID, IG-scoped id, or wa_id. */
  externalId: string;
  externalHandle: string | null;
  displayName: string | null;
  /** Provider message id, used for per-tenant message dedupe. */
  externalMessageId: string | null;
  text: string | null;
  kind: InboundItemKind;
  source: InboundAttribution;
};

export type VerificationFailure =
  | "missing_signature"
  | "missing_secret"
  | "malformed_signature"
  | "signature_mismatch"
  | "timestamp_out_of_tolerance"
  | "missing_token"
  | "token_mismatch";

export type VerificationResult =
  | { ok: true }
  | { ok: false; reason: VerificationFailure };

export type HubChallengeResult =
  | { ok: true; challenge: string }
  | { ok: false; reason: VerificationFailure };

export type DeliveryStatus =
  | "received"
  | "processed"
  | "rejected"
  | "unresolved_tenant"
  | "bad_signature"
  | "duplicate";
