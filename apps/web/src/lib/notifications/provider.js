export const NOTIFICATION_SEND_STATUSES = [
  "queued",
  "sent",
  "failed",
  "skipped_disabled",
  "skipped_missing_recipient",
  "skipped_no_provider",
  "skipped_suppressed",
];

function enabled(value) {
  return String(value ?? "").toLowerCase() === "true";
}

export function resolveNotificationProvider(channel, env = {}) {
  if (channel === "email") {
    const configured = Boolean(env.RESEND_API_KEY && env.NOTIFICATIONS_EMAIL_FROM);
    return {
      configured,
      provider: "resend",
      reason: configured
        ? null
        : "Email provider is not configured.",
    };
  }
  if (channel === "sms") {
    const configured = Boolean(
      env.TWILIO_ACCOUNT_SID &&
        env.TWILIO_AUTH_TOKEN &&
        env.TWILIO_FROM_NUMBER,
    );
    return {
      configured,
      provider: "twilio",
      reason: configured ? null : "SMS provider is not configured.",
    };
  }
  return {
    configured: false,
    provider: "none",
    reason: "Unsupported notification channel.",
  };
}

export function canAttemptLiveSend({ businessLiveEnabled, channel, env = {} }) {
  const provider = resolveNotificationProvider(channel, env);
  if (!enabled(env.NOTIFICATIONS_DISPATCH_ENABLED)) {
    return {
      ok: false,
      provider: provider.provider,
      reason: "Notification dispatch is disabled.",
      status: "skipped_disabled",
    };
  }
  if (!enabled(env.NOTIFICATIONS_LIVE_SEND_ENABLED)) {
    return {
      ok: false,
      provider: provider.provider,
      reason: "Live notification sending is disabled.",
      status: "skipped_disabled",
    };
  }
  if (!businessLiveEnabled) {
    return {
      ok: false,
      provider: provider.provider,
      reason: "Live sending is disabled for this business.",
      status: "skipped_disabled",
    };
  }
  if (!provider.configured) {
    return {
      ok: false,
      provider: provider.provider,
      reason: provider.reason,
      status: "skipped_no_provider",
    };
  }
  return {
    ok: true,
    provider: provider.provider,
    reason: null,
    status: "queued",
  };
}
