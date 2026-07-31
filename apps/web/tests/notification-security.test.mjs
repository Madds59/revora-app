import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// APPSEC-09 Phase 4C — notification queue/dispatch authorization.
//
// The dispatcher runs entirely on the service role and pulls work from a
// SECURITY DEFINER claim RPC that selects by channel/status/schedule only. The
// row it hands back is untrusted stored input: before this phase the dispatcher
// addressed messages using the row's own `recipient_email`/`recipient_phone`,
// so a poisoned or stale row would have been delivered verbatim.

import {
  authorizeEventForDispatch,
  boundedAttemptCount,
  claimedEventSchema,
  DISPATCHABLE_CHANNELS,
  IN_APP_CHANNEL,
  isClaimedProcessingStatus,
  isDispatchableChannel,
  isKnownTemplateKey,
  MAX_ATTEMPTS,
  normalizeEmailDestination,
  normalizePhoneDestination,
  normalizeProviderFailure,
  normalizeProviderMessageId,
  normalizeRecipientName,
  persistablePayloadSchema,
  queueCustomerNotificationSchema,
  TEMPLATE_SOURCES,
} from "../src/lib/validation/notifications.js";

const BIZ = "c883e981-3627-4482-be63-348b0950f15e";
const OTHER_BIZ = "11111111-2222-4333-8444-555566667777";
const CUST = "22222222-3333-4444-8555-666677778888";
const OTHER_CUST = "33333333-4444-4555-8666-777788889999";
const QUOTE = "44444444-5555-4666-8777-888899990000";
const AR_NAME = "محمد بن راشد";
const ok = (r) => r.success === true;

const business = { id: BIZ, name: "Revora Garage" };
const customer = {
  id: CUST,
  business_id: BIZ,
  email: "customer@example.com",
  phone: "+971 4 123 4567",
  full_name: "Aisha Al Nuaimi",
  preferred_language: "en",
};

const validEvent = {
  id: "55555555-6666-4777-8888-999900001111",
  business_id: BIZ,
  customer_id: CUST,
  channel: "email",
  template_key: "quote_sent",
  locale: "en",
  dedupe_key: "quote_sent:x:email",
  attempt_count: 0,
  status: "processing",
  payload: {
    type: "quote_sent",
    quote_id: QUOTE,
    quote_number: "Q-1001",
    business_name: "Revora Garage",
    customer_name: "Aisha Al Nuaimi",
    template_variables: { quoteNumber: "Q-1001" },
  },
};

const authorize = (over = {}) =>
  authorizeEventForDispatch({
    event: validEvent,
    business,
    customer,
    sourceMatches: true,
    ...over,
  });

// --- queue-time --------------------------------------------------------------

const validQueueInput = {
  businessId: BIZ,
  customerId: CUST,
  templateKey: "quote_sent",
  dedupeKey: "quote_sent:abc",
  payload: { type: "quote_sent", quote_id: QUOTE, quote_number: "Q-1001" },
  variables: { quoteNumber: "Q-1001" },
};

test("queue: valid quote/job/complaint inputs accepted", () => {
  for (const templateKey of [
    "quote_sent",
    "job_status_changed",
    "job_completed",
    "complaint_status_changed",
  ]) {
    assert.equal(
      ok(queueCustomerNotificationSchema.safeParse({ ...validQueueInput, templateKey })),
      true,
      `${templateKey} should queue`,
    );
  }
});

test("queue: malformed business/customer selectors rejected", () => {
  assert.equal(ok(queueCustomerNotificationSchema.safeParse({ ...validQueueInput, businessId: "x" })), false);
  assert.equal(ok(queueCustomerNotificationSchema.safeParse({ ...validQueueInput, customerId: "" })), false);
});

test("queue: unsupported template rejected", () => {
  for (const bad of ["not_a_template", "", "quote_sent; drop", null]) {
    assert.equal(
      ok(queueCustomerNotificationSchema.safeParse({ ...validQueueInput, templateKey: bad })),
      false,
      `${bad} must be rejected`,
    );
  }
});

test("queue: only dispatchable channels survive; push and invented channels dropped", () => {
  const r = queueCustomerNotificationSchema.safeParse({
    ...validQueueInput,
    channels: ["email", "push", "whatsapp", "carrier-pigeon", "sms"],
  });
  assert.equal(ok(r), true);
  assert.deepEqual(r.data.channels, ["email", "sms"]);
  assert.equal(isDispatchableChannel(IN_APP_CHANNEL), false);
  assert.deepEqual(DISPATCHABLE_CHANNELS, ["email", "sms"]);
});

test("queue: dedupe key is bounded and control-character free", () => {
  assert.equal(ok(queueCustomerNotificationSchema.safeParse({ ...validQueueInput, dedupeKey: "" })), false);
  assert.equal(
    ok(queueCustomerNotificationSchema.safeParse({ ...validQueueInput, dedupeKey: "a".repeat(300) })),
    false,
  );
  assert.equal(
    ok(queueCustomerNotificationSchema.safeParse({ ...validQueueInput, dedupeKey: `a\u0000b` })),
    false,
  );
});

test("queue: template variables reject non-scalar values", () => {
  for (const bad of [{ nested: { a: 1 } }, { arr: [1, 2] }, { inf: Infinity }]) {
    assert.equal(
      ok(queueCustomerNotificationSchema.safeParse({ ...validQueueInput, variables: bad })),
      false,
      `${JSON.stringify(bad)} must be rejected`,
    );
  }
});

test("payload: only allowlisted keys are persisted — extras stripped", () => {
  const r = persistablePayloadSchema.safeParse({
    type: "quote_sent",
    quote_id: QUOTE,
    business_name: "Revora Garage",
    // None of these may reach the stored event.
    signed_url: "https://example.com/storage/v1/object/sign/x?token=abc",
    object_path: `${BIZ}/complaint-evidence/x.pdf`,
    redirect_url: "https://evil.example.com",
    api_key: "secret-value",
    customer_notes: "private",
  });
  assert.equal(ok(r), true);
  for (const key of ["signed_url", "object_path", "redirect_url", "api_key", "customer_notes"]) {
    assert.equal(key in r.data, false, `${key} must be stripped`);
  }
  assert.equal(r.data.quote_id, QUOTE);
});

test("payload: malformed source ids rejected", () => {
  assert.equal(ok(persistablePayloadSchema.safeParse({ quote_id: "not-a-uuid" })), false);
  assert.equal(ok(persistablePayloadSchema.safeParse({ job_id: "" })), false);
});

// --- dispatch-time authorization --------------------------------------------

test("dispatch: valid claimed event is authorized", () => {
  const d = authorize();
  assert.equal(d.allowed, true);
  assert.equal(d.channel, "email");
  assert.equal(d.templateKey, "quote_sent");
  assert.equal(d.attemptCount, 0);
});

test("dispatch: destination is RE-DERIVED from the verified customer", () => {
  // The stored recipient columns are poisoned; they must be ignored entirely.
  const poisoned = {
    ...validEvent,
    recipient_email: "attacker@evil.example",
    recipient_phone: "+99 999 999 9999",
    recipient_name: "Attacker",
  };
  const d = authorize({ event: poisoned });
  assert.equal(d.allowed, true);
  assert.equal(d.destination, customer.email);
  assert.notEqual(d.destination, "attacker@evil.example");
  assert.equal(d.recipientName, customer.full_name);

  const sms = authorize({ event: { ...poisoned, channel: "sms" } });
  assert.equal(sms.destination, customer.phone);
  assert.notEqual(sms.destination, "+99 999 999 9999");
});

test("dispatch: missing business or customer denies", () => {
  assert.equal(authorize({ business: null }).code, "business_unverified");
  assert.equal(authorize({ customer: null }).code, "customer_unverified");
});

test("dispatch: business/customer mismatch denies", () => {
  // Event names one business, the loaded customer belongs to another.
  assert.equal(
    authorize({ customer: { ...customer, business_id: OTHER_BIZ } }).code,
    "customer_business_mismatch",
  );
  // Loaded business is not the event's business.
  assert.equal(authorize({ business: { id: OTHER_BIZ, name: "B" } }).code, "business_unverified");
  // Loaded customer is a different customer than the event names.
  assert.equal(authorize({ customer: { ...customer, id: OTHER_CUST } }).code, "customer_unverified");
});

test("dispatch: source resource that does not belong to the business denies", () => {
  assert.equal(authorize({ sourceMatches: false }).code, "source_unverified");
  // A template with no source resource does not require one.
  const noSource = authorize({
    event: { ...validEvent, template_key: "feedback_submitted" },
    sourceMatches: null,
  });
  assert.equal(noSource.allowed, true);
  assert.equal(TEMPLATE_SOURCES.feedback_submitted.table, null);
});

test("dispatch: non-dispatchable channels blocked before any provider selection", () => {
  for (const channel of ["push", "whatsapp", "facebook", "instagram", "tiktok", "", "EMAIL"]) {
    const d = authorize({ event: { ...validEvent, channel } });
    assert.equal(d.allowed, false, `${channel || "(blank)"} must be blocked`);
    assert.equal(d.code, "channel_not_dispatchable");
  }
});

test("dispatch: unknown template blocked", () => {
  const d = authorize({ event: { ...validEvent, template_key: "made_up_template" } });
  assert.equal(d.allowed, false);
  assert.equal(d.code, "template_unknown");
  assert.equal(isKnownTemplateKey("made_up_template"), false);
});

test("dispatch: malformed stored row denied as poisoned", () => {
  for (const bad of [
    { ...validEvent, id: "not-a-uuid" },
    { ...validEvent, business_id: "" },
    { ...validEvent, customer_id: "nope" },
    { ...validEvent, attempt_count: -5 },
    { ...validEvent, attempt_count: 1.5 },
    null,
    "string",
  ]) {
    const d = authorize({ event: bad });
    assert.equal(d.allowed, false);
    assert.equal(d.code, "event_malformed");
  }
});

test("dispatch: event with no customer cannot resolve a recipient", () => {
  const d = authorize({ event: { ...validEvent, customer_id: null }, customer: null });
  assert.equal(d.allowed, false);
  assert.equal(d.code, "recipient_unresolved");
});

test("dispatch: customer without a usable destination is skipped, not sent", () => {
  assert.equal(authorize({ customer: { ...customer, email: null } }).code, "recipient_unresolved");
  assert.equal(authorize({ customer: { ...customer, email: "not-an-email" } }).code, "recipient_unresolved");
  const sms = authorize({ event: { ...validEvent, channel: "sms" }, customer: { ...customer, phone: "abc" } });
  assert.equal(sms.code, "recipient_unresolved");
});

test("dispatch: invalid payload denies", () => {
  const d = authorize({ event: { ...validEvent, payload: { quote_id: "not-a-uuid" } } });
  assert.equal(d.allowed, false);
  assert.equal(d.code, "payload_invalid");
});

test("dispatch: locale follows the verified customer and normalizes", () => {
  const ar = authorize({ customer: { ...customer, preferred_language: "ar" } });
  assert.equal(ar.locale, "ar");
  // Unsupported/poisoned locales normalize rather than leak through.
  const weird = authorize({
    event: { ...validEvent, locale: "zz" },
    customer: { ...customer, preferred_language: "zz" },
  });
  assert.equal(weird.locale, "en");
});

test("dispatch: Arabic recipient names survive as bounded display text", () => {
  const d = authorize({ customer: { ...customer, full_name: `  ${AR_NAME}  ` } });
  assert.equal(d.recipientName, AR_NAME);
});

test("dispatch: attempts are clamped and exhaustion stops retrying", () => {
  assert.equal(boundedAttemptCount(-10), 0);
  assert.equal(boundedAttemptCount(9_999), MAX_ATTEMPTS);
  assert.equal(boundedAttemptCount("x"), 0);
  assert.equal(boundedAttemptCount(2), 2);
  const exhausted = authorize({ event: { ...validEvent, attempt_count: MAX_ATTEMPTS } });
  assert.equal(exhausted.allowed, false);
  assert.equal(exhausted.code, "attempts_exhausted");
});

test("dispatch: only a claimed 'processing' row is legitimate", () => {
  assert.equal(isClaimedProcessingStatus("processing"), true);
  for (const s of ["queued", "sent", "failed", "", null, undefined]) {
    assert.equal(isClaimedProcessingStatus(s), false);
  }
});

// --- destinations and provider normalization --------------------------------

test("destinations: email/phone shape rules, control characters rejected", () => {
  assert.equal(normalizeEmailDestination("  a@b.co  "), "a@b.co");
  for (const bad of ["", "no-at", "a@b", "a@b.co\u0000", "a b@c.co", null, 42]) {
    assert.equal(normalizeEmailDestination(bad), null, `${bad} must be refused`);
  }
  assert.equal(normalizePhoneDestination("+971 4 123 4567"), "+971 4 123 4567");
  assert.equal(normalizePhoneDestination("0501234567"), "0501234567"); // leading zero kept
  for (const bad of ["", "call me", "12", "+", "a\u0001b", null]) {
    assert.equal(normalizePhoneDestination(bad), null, `${bad} must be refused`);
  }
  assert.equal(normalizeRecipientName("  a\u0000b  "), null);
});

test("provider: raw failures are reduced to stable categories", () => {
  assert.equal(normalizeProviderFailure(401), "provider_auth");
  assert.equal(normalizeProviderFailure(429), "provider_rate_limited");
  assert.equal(normalizeProviderFailure(500), "provider_unavailable");
  assert.equal(normalizeProviderFailure(422), "provider_rejected");
  assert.equal(normalizeProviderFailure(504), "provider_timeout");
  assert.equal(normalizeProviderFailure("boom"), "provider_unknown");
  // Provider message ids are opaque, bounded handles.
  assert.equal(normalizeProviderMessageId("  abc123  "), "abc123");
  assert.equal(normalizeProviderMessageId("x".repeat(500)), null);
  assert.equal(normalizeProviderMessageId("a\u0000b"), null);
});

test("claimed row schema tolerates recipient columns but never authorizes on them", () => {
  const r = claimedEventSchema.safeParse({ ...validEvent, recipient_email: { evil: true } });
  assert.equal(ok(r), true); // parses...
  // ...and the authorization result still uses the verified customer.
  const d = authorize({ event: { ...validEvent, recipient_email: { evil: true } } });
  assert.equal(d.destination, customer.email);
});

// --- static regressions ------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const serviceSrc = readFileSync(path.resolve(here, "../src/lib/notifications/service.ts"), "utf8");
const providerSrc = readFileSync(path.resolve(here, "../src/lib/notifications/provider.js"), "utf8");

test("security: dispatch authorizes the stored row before any provider call", () => {
  assert.match(serviceSrc, /authorizeEventForDispatch\(/);
  const dispatchBody = serviceSrc.slice(serviceSrc.indexOf("async function dispatchEvent"));
  assert.ok(
    dispatchBody.indexOf("authorizeEventForDispatch") < dispatchBody.indexOf("await sendEmail"),
    "authorization must precede sendEmail",
  );
  assert.ok(
    dispatchBody.indexOf("authorizeEventForDispatch") < dispatchBody.indexOf("await sendSms"),
    "authorization must precede sendSms",
  );
});

test("security: providers are addressed only with the re-derived destination", () => {
  // The stored recipient columns must never be passed to a provider.
  assert.doesNotMatch(serviceSrc, /to:\s*clean\(event\.recipient_email\)/);
  assert.doesNotMatch(serviceSrc, /to:\s*event\.recipient_(email|phone)/);
  assert.match(serviceSrc, /const destination = decision\.destination as string;/);
  assert.match(serviceSrc, /to: destination/);
});

test("security: queue writes use verified rows, not caller selectors", () => {
  assert.match(serviceSrc, /queueCustomerNotificationSchema\.safeParse\(/);
  assert.match(serviceSrc, /business_id: business\.id/);
  assert.match(serviceSrc, /customer_id: customer\.id/);
  assert.doesNotMatch(serviceSrc, /business_id: input\.businessId/);
  assert.doesNotMatch(serviceSrc, /customer_id: input\.customerId/);
  // Raw caller payload must not be spread straight onto the row.
  assert.match(serviceSrc, /persistablePayloadSchema\.safeParse\(/);
});

test("security: raw provider text is never stored or logged", () => {
  assert.match(serviceSrc, /normalizeProviderFailure\(response\.status\)/);
  assert.doesNotMatch(serviceSrc, /failureReason: json\?\.message/);
  // Logs carry stable codes only. Strip string literals first so a code NAMED
  // e.g. "payload_invalid" is allowed, while logging an actual value is not.
  const withoutStrings = serviceSrc.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""');
  const consoleCalls = withoutStrings.match(/console\.(error|log)\([^)]*\)/g) ?? [];
  for (const call of consoleCalls) {
    assert.doesNotMatch(
      call,
      /(event\.payload|decision\.destination|customer\.(email|phone)|rendered\.|recipient|destination)/,
      `log must not carry content: ${call}`,
    );
  }
  assert.ok(consoleCalls.length > 0, "expected some diagnostic logging");
});

test("security: live delivery stays disabled by default and gates are intact", () => {
  // Both env gates plus the per-business flag must all be true to send.
  assert.match(providerSrc, /NOTIFICATIONS_DISPATCH_ENABLED/);
  assert.match(providerSrc, /NOTIFICATIONS_LIVE_SEND_ENABLED/);
  assert.match(providerSrc, /businessLiveEnabled/);
  assert.match(serviceSrc, /canAttemptLiveSend\(/);
  const dispatchBody = serviceSrc.slice(serviceSrc.indexOf("async function dispatchEvent"));
  assert.ok(
    dispatchBody.indexOf("canAttemptLiveSend") < dispatchBody.indexOf("await sendEmail"),
    "the live-send gate must be consulted before any provider call",
  );
});

test("security: a poisoned row is released instead of holding its lock", () => {
  const batch = serviceSrc.slice(serviceSrc.indexOf("export async function processQueuedNotifications"));
  assert.match(batch, /catch\s*{/);
  assert.match(batch, /locked_until: null/);
  assert.match(batch, /dispatch_error/);
  // Terminal updates are guarded on the claimed status.
  assert.match(serviceSrc, /\.eq\("status", "processing"\)/);
});

test("security: Phase 4C touched no migration, RLS, launch-ops or Stripe path", () => {
  assert.doesNotMatch(serviceSrc, /create policy|alter table|create or replace function/i);
  assert.doesNotMatch(serviceSrc, /launch-ops|stripe/i);
});
