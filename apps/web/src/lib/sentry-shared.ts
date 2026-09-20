import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/** Next.js control-flow "errors" that must never be reported. */
const CONTROL_FLOW_DIGESTS = ["NEXT_REDIRECT", "NEXT_NOT_FOUND", "NEXT_HTTP_ERROR_FALLBACK"];

export function isControlFlowError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const digest = (error as { digest?: unknown }).digest;
  const message = (error as { message?: unknown }).message;
  return CONTROL_FLOW_DIGESTS.some(
    (code) =>
      (typeof digest === "string" && digest.startsWith(code)) ||
      (typeof message === "string" && message.startsWith(code)),
  );
}

/**
 * Drop control-flow errors, strip request bodies/cookies/headers, and drop
 * console breadcrumbs that look like they contain an email address.
 */
export function beforeSend(event: ErrorEvent, hint: EventHint): ErrorEvent | null {
  if (isControlFlowError(hint.originalException)) return null;

  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
  }
  event.user = undefined;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.filter(
      (b) => !(b.category === "console" && typeof b.message === "string" && b.message.includes("@")),
    );
  }
  return event;
}
