import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  hashVerifyToken,
  secretEquals,
  verifyHubChallenge,
  verifyMetaSignature,
  withinTolerance,
} from "../src/lib/inbound/verify.js";
import {
  deriveEventId,
  normaliseMetaLeadgen,
  normaliseMetaMessaging,
  normaliseMetaWebhook,
  normaliseWhatsApp,
} from "../src/lib/inbound/meta-payload.js";

const migration0048 = readFileSync(
  new URL("../../../supabase/migrations/0048_inbound_capture.sql", import.meta.url),
  "utf8",
);
const migration0049 = readFileSync(
  new URL("../../../supabase/migrations/0049_inbound_rate_limit_scope.sql", import.meta.url),
  "utf8",
);

const APP_SECRET = "test-app-secret";

/** Signs a body the way Meta does, so the positive control is a real signature. */
function sign(body, secret = APP_SECRET) {
  return `sha256=${crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

// ---------------------------------------------------------------------------
// Signature verification.
//
// The first test is the positive control for every rejection that follows: if
// a correctly computed signature did not pass, "rejects a bad signature" would
// be satisfied by a verifier that rejects everything.
// ---------------------------------------------------------------------------

test("a correctly computed Meta signature is accepted (positive control)", () => {
  const body = JSON.stringify({ object: "instagram", entry: [] });
  assert.deepEqual(verifyMetaSignature(body, sign(body), APP_SECRET), { ok: true });
});

test("a tampered body is rejected even though the signature is well formed", () => {
  const body = JSON.stringify({ object: "instagram", entry: [] });
  const signature = sign(body);
  const tampered = `${body} `;
  assert.deepEqual(verifyMetaSignature(tampered, signature, APP_SECRET), {
    ok: false,
    reason: "signature_mismatch",
  });
});

test("a signature made with the wrong secret is rejected", () => {
  const body = "{}";
  assert.deepEqual(verifyMetaSignature(body, sign(body, "other-secret"), APP_SECRET), {
    ok: false,
    reason: "signature_mismatch",
  });
});

test("signature verification distinguishes its failure modes", () => {
  const body = "{}";
  assert.equal(verifyMetaSignature(body, null, APP_SECRET).reason, "missing_signature");
  assert.equal(verifyMetaSignature(body, sign(body), null).reason, "missing_secret");
  assert.equal(verifyMetaSignature(body, "sha1=abcdef", APP_SECRET).reason, "malformed_signature");
  assert.equal(verifyMetaSignature(body, "sha256=zzzz", APP_SECRET).reason, "malformed_signature");
  assert.equal(verifyMetaSignature(body, "garbage", APP_SECRET).reason, "malformed_signature");
  // Right shape, right length, wrong value: a mismatch, not malformed.
  const wrong = "sha256=" + "0".repeat(64);
  assert.equal(verifyMetaSignature(body, wrong, APP_SECRET).reason, "signature_mismatch");
  // A truncated digest must not pass on a prefix match.
  const real = sign(body).slice("sha256=".length);
  assert.equal(
    verifyMetaSignature(body, `sha256=${real.slice(0, 32)}`, APP_SECRET).reason,
    "signature_mismatch",
  );
});

test("signature header casing and surrounding whitespace are tolerated", () => {
  const body = JSON.stringify({ a: 1 });
  const hex = sign(body).slice("sha256=".length);
  assert.deepEqual(
    verifyMetaSignature(body, `  sha256=${hex.toUpperCase()}  `, APP_SECRET),
    { ok: true },
  );
});

test("the subscription handshake echoes the challenge only for the right token", () => {
  const ok = verifyHubChallenge(
    { mode: "subscribe", verifyToken: "tok", challenge: "1234" },
    "tok",
  );
  assert.deepEqual(ok, { ok: true, challenge: "1234" });

  assert.equal(
    verifyHubChallenge({ mode: "subscribe", verifyToken: "nope", challenge: "1" }, "tok").reason,
    "token_mismatch",
  );
  assert.equal(
    verifyHubChallenge({ mode: "unsubscribe", verifyToken: "tok", challenge: "1" }, "tok").reason,
    "malformed_signature",
  );
  assert.equal(
    verifyHubChallenge({ mode: "subscribe", verifyToken: "tok", challenge: null }, "tok").reason,
    "missing_token",
  );
  assert.equal(
    verifyHubChallenge({ mode: "subscribe", verifyToken: "tok", challenge: "1" }, null).reason,
    "missing_secret",
  );
});

test("secretEquals is false for unequal values, including prefixes", () => {
  assert.equal(secretEquals("abc", "abc"), true);
  assert.equal(secretEquals("abc", "abd"), false);
  assert.equal(secretEquals("abc", "abcd"), false);
  assert.equal(secretEquals("", ""), false);
  assert.equal(secretEquals(null, "abc"), false);
  assert.equal(secretEquals("abc", undefined), false);
});

test("verify tokens are hashed to 32 bytes, deterministically and distinctly", () => {
  const a = hashVerifyToken("token-a");
  assert.equal(a.length, 32);
  assert.deepEqual(a, hashVerifyToken("token-a"));
  assert.notDeepEqual(a, hashVerifyToken("token-b"));
});

test("withinTolerance rejects stale and non-finite timestamps", () => {
  const now = 1_700_000_000_000;
  const nowSeconds = Math.floor(now / 1000);
  assert.equal(withinTolerance(nowSeconds, 300, now), true);
  assert.equal(withinTolerance(nowSeconds - 299, 300, now), true);
  assert.equal(withinTolerance(nowSeconds - 301, 300, now), false);
  assert.equal(withinTolerance(nowSeconds + 301, 300, now), false);
  assert.equal(withinTolerance(Number.NaN, 300, now), false);
});

// ---------------------------------------------------------------------------
// Payload normalisation.
// ---------------------------------------------------------------------------

const IG_DM = {
  object: "instagram",
  entry: [
    {
      id: "ig-account-1",
      messaging: [
        {
          sender: { id: "psid-1" },
          recipient: { id: "ig-account-1" },
          message: { mid: "mid-1", text: "Do you service a 2018 Patrol?" },
        },
      ],
    },
  ],
};

test("an Instagram DM normalises to one inbound item", () => {
  const [item, ...rest] = normaliseMetaMessaging(IG_DM);
  assert.equal(rest.length, 0);
  assert.equal(item.channel, "instagram");
  assert.equal(item.externalAccountId, "ig-account-1");
  assert.equal(item.externalId, "psid-1");
  assert.equal(item.externalMessageId, "mid-1");
  assert.equal(item.text, "Do you service a 2018 Patrol?");
  assert.equal(item.kind, "message");
});

test("an echo of our own outbound message is dropped, but the same payload without is_echo is kept", () => {
  const echo = structuredClone(IG_DM);
  echo.entry[0].messaging[0].message.is_echo = true;
  assert.equal(normaliseMetaMessaging(echo).length, 0);
  // Positive control: the drop above is caused by is_echo and nothing else.
  assert.equal(normaliseMetaMessaging(IG_DM).length, 1);
});

test("delivery and read receipts produce no leads", () => {
  const receipt = {
    object: "instagram",
    entry: [
      {
        id: "ig-account-1",
        messaging: [{ sender: { id: "psid-1" }, delivery: { mids: ["mid-1"] } }],
      },
    ],
  };
  assert.equal(normaliseMetaMessaging(receipt).length, 0);
});

test("a Messenger payload is labelled facebook, not instagram", () => {
  const messenger = structuredClone(IG_DM);
  messenger.object = "page";
  assert.equal(normaliseMetaMessaging(messenger)[0].channel, "facebook");
});

test("an attachment-only message is still captured", () => {
  const withAttachment = {
    object: "instagram",
    entry: [
      {
        id: "ig-account-1",
        messaging: [
          {
            sender: { id: "psid-2" },
            message: { mid: "mid-2", attachments: [{ type: "image" }] },
          },
        ],
      },
    ],
  };
  const items = normaliseMetaMessaging(withAttachment);
  assert.equal(items.length, 1);
  assert.equal(items[0].text, null);
});

test("a Meta lead-ad submission carries campaign attribution and the leadgen id", () => {
  const leadgen = {
    object: "page",
    entry: [
      {
        id: "page-9",
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: 555,
              form_id: "form-1",
              ad_id: "ad-2",
              campaign_id: "camp-3",
            },
          },
        ],
      },
    ],
  };
  const [item] = normaliseMetaLeadgen(leadgen);
  assert.equal(item.channel, "meta_lead_ad");
  assert.equal(item.externalAccountId, "page-9");
  // Numeric ids are coerced, not dropped.
  assert.equal(item.externalId, "555");
  assert.equal(item.kind, "lead_form");
  assert.deepEqual(item.source, {
    campaignId: "camp-3",
    adId: "ad-2",
    formId: "form-1",
    leadgenId: "555",
  });
});

test("the Meta route normaliser handles messaging and leadgen on one endpoint", () => {
  assert.equal(normaliseMetaWebhook(IG_DM).length, 1);
  const combined = {
    object: "page",
    entry: [
      {
        id: "page-9",
        messaging: [{ sender: { id: "psid-3" }, message: { mid: "m3", text: "hi" } }],
        changes: [{ field: "leadgen", value: { leadgen_id: "lg-1" } }],
      },
    ],
  };
  const items = normaliseMetaWebhook(combined);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((i) => i.channel).sort(), ["facebook", "meta_lead_ad"]);
});

const WA_MESSAGE = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba-account-id",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "97140000000", phone_number_id: "phone-num-1" },
            contacts: [{ profile: { name: "Sara" }, wa_id: "971500000001" }],
            messages: [
              {
                from: "971500000001",
                id: "wamid.1",
                type: "text",
                text: { body: "Brakes feel soft" },
              },
            ],
          },
        },
      ],
    },
  ],
};

test("a WhatsApp message resolves the tenant from phone_number_id, not the WABA entry id", () => {
  const [item] = normaliseWhatsApp(WA_MESSAGE);
  assert.equal(item.channel, "whatsapp");
  // The distinction that matters: one WABA can hold several numbers, so the
  // entry id would route every number to the same tenant.
  assert.equal(item.externalAccountId, "phone-num-1");
  assert.notEqual(item.externalAccountId, "waba-account-id");
  assert.equal(item.externalId, "971500000001");
  assert.equal(item.displayName, "Sara");
  assert.equal(item.externalMessageId, "wamid.1");
  assert.equal(item.text, "Brakes feel soft");
});

test("WhatsApp delivery statuses do not become leads", () => {
  const statusOnly = structuredClone(WA_MESSAGE);
  delete statusOnly.entry[0].changes[0].value.messages;
  delete statusOnly.entry[0].changes[0].value.contacts;
  statusOnly.entry[0].changes[0].value.statuses = [
    { id: "wamid.1", status: "delivered", recipient_id: "971500000001" },
  ];
  assert.equal(normaliseWhatsApp(statusOnly).length, 0);
  // Positive control: the same shape WITH messages still normalises.
  assert.equal(normaliseWhatsApp(WA_MESSAGE).length, 1);
});

test("a WhatsApp profile name is matched to the right sender only", () => {
  const twoSenders = structuredClone(WA_MESSAGE);
  twoSenders.entry[0].changes[0].value.messages.push({
    from: "971500000002",
    id: "wamid.2",
    type: "text",
    text: { body: "Second sender" },
  });
  const items = normaliseWhatsApp(twoSenders);
  assert.equal(items.length, 2);
  assert.equal(items.find((i) => i.externalId === "971500000001").displayName, "Sara");
  assert.equal(items.find((i) => i.externalId === "971500000002").displayName, null);
});

test("normalisers never throw and yield nothing for unusable payloads", () => {
  const junk = [
    null,
    undefined,
    0,
    "",
    "a string",
    [],
    {},
    { object: "instagram" },
    { object: "unknown-product", entry: [{ id: "x" }] },
    { object: "instagram", entry: "not-an-array" },
    { object: "instagram", entry: [null, 7, { messaging: [{}] }] },
    { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages" }] }] },
    // An account id is required: without one there is no tenant to resolve to.
    { object: "instagram", entry: [{ messaging: [{ sender: { id: "p" }, message: { text: "x" } }] }] },
  ];
  for (const payload of junk) {
    assert.deepEqual(normaliseMetaWebhook(payload), [], `meta: ${JSON.stringify(payload)}`);
    assert.deepEqual(normaliseWhatsApp(payload), [], `whatsapp: ${JSON.stringify(payload)}`);
  }
});

test("deriveEventId picks the first identifiable id, or null", () => {
  assert.equal(deriveEventId(normaliseMetaMessaging(IG_DM)), "mid-1");
  assert.equal(deriveEventId(normaliseWhatsApp(WA_MESSAGE)), "wamid.1");
  assert.equal(deriveEventId([]), null);
  assert.equal(deriveEventId([{ externalMessageId: null }, { externalMessageId: "x" }]), "x");
});

// ---------------------------------------------------------------------------
// Migration invariants. Asserted against the SQL text, the way
// notifications.test.mjs and the other security tests do, so a later edit that
// quietly drops one of these is caught offline as well as by the db suite.
// ---------------------------------------------------------------------------

test("0048 resolves tenants with a global unique on the channel account", () => {
  assert.match(
    migration0048,
    /unique \(channel, external_account_id\)/,
    "tenant resolution depends on this being global, not per business",
  );
});

test("0048 locks the pre-tenant webhook table with both RLS and a revoke", () => {
  assert.match(
    migration0048,
    /alter table public\.inbound_webhook_events enable row level security/,
  );
  assert.match(
    migration0048,
    /revoke all on public\.inbound_webhook_events from anon, authenticated/,
    "0003 grants all on new tables to anon/authenticated, so the revoke is load-bearing",
  );
  // No policy may exist on that table: RLS with zero policies is the design.
  assert.doesNotMatch(migration0048, /create policy "inbound_webhook_events/);
});

test("0048 grants no customer-portal access to leads", () => {
  // A lead is business-internal. is_customer_* in any leads policy would be a
  // regression of that decision.
  const leadPolicies = migration0048.match(/create policy "lead[^"]*"[\s\S]*?;/g) ?? [];
  assert.ok(leadPolicies.length > 0, "expected lead policies to exist");
  for (const policy of leadPolicies) {
    assert.doesNotMatch(policy, /is_customer_/, `portal access leaked into: ${policy.slice(0, 60)}`);
  }
});

test("0048 references every tenant-owned parent compositely", () => {
  for (const [constraint, parent] of [
    ["leads_customer_fk", "customers"],
    ["leads_vehicle_fk", "vehicles"],
    ["leads_appointment_fk", "appointments"],
    ["leads_quotation_fk", "quotations"],
    ["leads_channel_identity_fk", "channel_identities"],
    ["lead_messages_lead_fk", "leads"],
    ["lead_messages_ai_tool_call_fk", "ai_tool_calls"],
    ["channel_identities_customer_fk", "customers"],
  ]) {
    const pattern = new RegExp(
      `constraint ${constraint}\\s+foreign key \\([a-z_]+, business_id\\)\\s+references public\\.${parent} \\(id, business_id\\)`,
    );
    assert.match(migration0048, pattern, `${constraint} must be composite`);
  }
});

test("0048 requires an AI-authored lead message to cite its model call", () => {
  assert.match(
    migration0048,
    /lead_messages_ai_requires_tool_call[\s\S]*?author_type <> 'ai_agent' or ai_tool_call_id is not null/,
  );
});

test("0049 adds the inbound scope and keeps all three function revokes", () => {
  assert.match(migration0049, /when 'inbound_ip' then/);
  // The allowlist must stay inside the function: a caller must not be able to
  // ask for a more generous limit.
  assert.match(migration0049, /raise exception 'consume_rate_limit: unknown scope %'/);
  for (const role of ["public", "anon", "authenticated"]) {
    assert.match(
      migration0049,
      new RegExp(`revoke all on function public\\.consume_rate_limit\\(text, text\\) from ${role};`),
      `revoking only from public leaves ${role} with a direct grant`,
    );
  }
});
