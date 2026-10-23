import type { Instrumentation } from "next";

const dsnConfigured = !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);

export async function register() {
  if (!dsnConfigured) return;
  if (process.env.NEXT_RUNTIME === "nodejs") await import("../sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("../sentry.edge.config");
}

// Captures Server Action / RSC render errors with route context. Lazy so the
// SDK stays out of the runtime entirely when Sentry is not configured.
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!dsnConfigured) return;
  const Sentry = await import("@sentry/nextjs");
  return Sentry.captureRequestError(...args);
};
