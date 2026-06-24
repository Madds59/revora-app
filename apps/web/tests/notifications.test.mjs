import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canAttemptLiveSend,
  resolveNotificationProvider,
} from "../src/lib/notifications/provider.js";
import {
  renderNotificationTemplate,
  redactNotificationText,
} from "../src/lib/notifications/templates.js";

const migration0030 = readFileSync(
  new URL("../../../supabase/migrations/0030_notifications_foundation.sql", import.meta.url),
  "utf8",
);

test("notification templates render localized email and SMS bodies", () => {
  const email = renderNotificationTemplate({
    channel: "email",
    locale: "en",
    templateKey: "quote_sent",
    variables: {
      businessName: "Revora Workshop",
      customerName: "Aisha",
      quoteNumber: "Q-1001",
    },
  });
  assert.match(email.subject, /Q-1001/);
  assert.match(email.body, /Aisha/);
  assert.match(email.body, /Revora Workshop/);

  const sms = renderNotificationTemplate({
    channel: "sms",
    locale: "ar",
    templateKey: "job_completed",
    variables: {
      businessName: "Revora",
      customerName: "Aisha",
      jobTitle: "Service visit",
    },
  });
  assert.match(sms.body, /Revora/);
  assert.doesNotMatch(sms.body, /\{\{/);
});

test("notification rendering redacts raw UUIDs", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  assert.equal(redactNotificationText(`Quote ${id}`), "Quote record");
  const rendered = renderNotificationTemplate({
    channel: "email",
    locale: "en",
    templateKey: "complaint_status_changed",
    variables: {
      businessName: "Revora",
      customerName: "Aisha",
      statusLabel: "resolved",
      subject: id,
    },
  });
  assert.doesNotMatch(rendered.body, /123e4567/);
});

test("notification providers default to no-op without env", () => {
  assert.deepEqual(resolveNotificationProvider("email", {}), {
    configured: false,
    provider: "resend",
    reason: "Email provider is not configured.",
  });
  assert.deepEqual(resolveNotificationProvider("sms", {}), {
    configured: false,
    provider: "twilio",
    reason: "SMS provider is not configured.",
  });
});

test("live notification send requires global and business enablement", () => {
  const configuredEnv = {
    NOTIFICATIONS_DISPATCH_ENABLED: "true",
    NOTIFICATIONS_EMAIL_FROM: "Revora <no-reply@example.test>",
    NOTIFICATIONS_LIVE_SEND_ENABLED: "true",
    RESEND_API_KEY: "test-key",
  };
  assert.equal(
    canAttemptLiveSend({
      businessLiveEnabled: false,
      channel: "email",
      env: configuredEnv,
    }).status,
    "skipped_disabled",
  );
  assert.equal(
    canAttemptLiveSend({
      businessLiveEnabled: true,
      channel: "email",
      env: configuredEnv,
    }).ok,
    true,
  );
  assert.equal(
    canAttemptLiveSend({
      businessLiveEnabled: true,
      channel: "email",
      env: { ...configuredEnv, RESEND_API_KEY: "" },
    }).status,
    "skipped_no_provider",
  );
});

test("notifications migration supports dedupe upserts and atomic queue claims", () => {
  assert.match(
    migration0030,
    /create unique index if not exists notification_events_business_dedupe_idx\s+on public\.notification_events \(business_id, dedupe_key\);/,
  );
  assert.doesNotMatch(
    migration0030,
    /notification_events_business_dedupe_idx[\s\S]*?where dedupe_key is not null;/,
  );
  assert.match(migration0030, /claim_queued_notification_events/);
  assert.match(migration0030, /for update skip locked/);
  assert.match(migration0030, /status = 'processing'/);
  assert.match(
    migration0030,
    /revoke all on function public\.claim_queued_notification_events\(integer, integer\) from authenticated;/,
  );
  assert.match(
    migration0030,
    /grant execute on function public\.claim_queued_notification_events\(integer, integer\) to service_role;/,
  );
});
