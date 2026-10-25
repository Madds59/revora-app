import crypto from "node:crypto";

/**
 * Signature verification for inbound webhooks.
 *
 * Pure on purpose: no Supabase, no process.env, no Next.js. The secret and the
 * raw body are passed IN, so every branch below is reachable from
 * `node --test` without stubbing an environment or standing up a request. This
 * is a .js module with JSDoc types for the same reason lib/notifications and
 * lib/vehicle-intelligence keep their pure logic in .js: tsconfig includes only
 * .ts and .tsx, so a .js file is importable from the test runner with no build
 * step, while its types stay declared in types.ts.
 *
 * WHY THE RAW BODY, NEVER PARSED JSON
 * The HMAC is computed over the exact bytes the provider sent. Parsing and
 * re-serialising changes key order, whitespace and number formatting, so a
 * signature checked against a re-serialised body fails for valid deliveries
 * and can be made to pass for payloads whose meaning differs from what was
 * signed. The route handlers read request.text() and hand that string here
 * before anything parses it.
 *
 * WHY CONSTANT-TIME COMPARISON
 * A plain inequality on a hex digest short-circuits at the first differing
 * byte and leaks its prefix to anyone who can time the response. This mirrors
 * verifyStripeWebhookSignature and isAuthorizedCronRequest, which make the
 * same argument.
 *
 * @typedef {import("./types").VerificationResult} VerificationResult
 * @typedef {import("./types").HubChallengeResult} HubChallengeResult
 */

/**
 * Length-checked constant-time equality over two hex strings.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function hexEquals(a, b) {
  // timingSafeEqual throws on a length mismatch, and length is not the secret.
  if (a.length !== b.length) return false;
  let left;
  let right;
  try {
    left = Buffer.from(a, "hex");
    right = Buffer.from(b, "hex");
  } catch {
    return false;
  }
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Length-checked constant-time equality over two utf8 strings.
 *
 * @param {string | null | undefined} provided
 * @param {string | null | undefined} expected
 * @returns {boolean}
 */
export function secretEquals(provided, expected) {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Verifies Meta's `X-Hub-Signature-256` header: `sha256=<hex>` where the digest
 * is HMAC-SHA256 of the raw body keyed with the Meta APP SECRET.
 *
 * Covers Instagram DMs, Messenger, Meta lead ads and the WhatsApp Cloud API —
 * all four are Meta products sharing one scheme.
 *
 * NOTE ON REPLAY. This header carries NO timestamp, unlike Stripe's, so there
 * is nothing here to expire. Replay protection for Meta rests entirely on the
 * unique index over (channel, external_event_id) in inbound_webhook_events: a
 * redelivered payload is recorded as a duplicate and dropped. Do not add a
 * fabricated timestamp check here and assume it helps.
 *
 * @param {string} rawBody
 * @param {string | null | undefined} signatureHeader
 * @param {string | null | undefined} appSecret
 * @returns {VerificationResult}
 */
export function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret) return { ok: false, reason: "missing_secret" };
  if (!signatureHeader) return { ok: false, reason: "missing_signature" };

  const match = /^sha256=([0-9a-f]+)$/i.exec(signatureHeader.trim());
  if (!match) return { ok: false, reason: "malformed_signature" };

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  return hexEquals(match[1].toLowerCase(), expected)
    ? { ok: true }
    : { ok: false, reason: "signature_mismatch" };
}

/**
 * Verifies the one-time subscription handshake Meta performs with GET:
 * `?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`
 *
 * The verify token is configured once per Meta APP, not per page or per
 * number, so it is platform-level here rather than read from a route row.
 * inbound_channel_routes.verify_token_hash exists for providers that really do
 * verify per route; Meta is not one of them, and leaving it unused for Meta is
 * deliberate rather than an oversight. (The Stage 0 design document originally
 * described this as per-route; that was wrong about Meta and is corrected
 * there.)
 *
 * Returns the challenge to echo verbatim on success. Echoing it without
 * checking the token would let anyone point their own Meta app configuration
 * at this deployment.
 *
 * @param {{ mode: string | null, verifyToken: string | null, challenge: string | null }} params
 * @param {string | null | undefined} expectedToken
 * @returns {HubChallengeResult}
 */
export function verifyHubChallenge(params, expectedToken) {
  if (!expectedToken) return { ok: false, reason: "missing_secret" };
  if (params.mode !== "subscribe") return { ok: false, reason: "malformed_signature" };
  if (!params.verifyToken) return { ok: false, reason: "missing_token" };
  if (!params.challenge) return { ok: false, reason: "missing_token" };
  if (!secretEquals(params.verifyToken, expectedToken)) {
    return { ok: false, reason: "token_mismatch" };
  }
  return { ok: true, challenge: params.challenge };
}

/**
 * SHA-256 of a verify token, for the `bytea` column on inbound_channel_routes.
 * The raw token is never stored: that table is readable by every member of the
 * business it belongs to.
 *
 * @param {string} token
 * @returns {Buffer}
 */
export function hashVerifyToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest();
}

/**
 * Optional timestamp tolerance, for providers that DO sign a timestamp.
 * Unused by the Meta routes (see above); exported so a future voice or email
 * route does not reinvent it. Tolerance matches the 300s the Stripe verifier
 * uses.
 *
 * @param {number} timestampSeconds
 * @param {number} [toleranceSeconds]
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export function withinTolerance(
  timestampSeconds,
  toleranceSeconds = 300,
  nowMs = Date.now(),
) {
  if (!Number.isFinite(timestampSeconds)) return false;
  const age = Math.abs(Math.floor(nowMs / 1000) - timestampSeconds);
  return age <= toleranceSeconds;
}
