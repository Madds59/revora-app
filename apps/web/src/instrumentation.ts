import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Captures Server Action and RSC render errors with route context. A no-op
// when Sentry.init never ran (no DSN).
export const onRequestError = Sentry.captureRequestError;
