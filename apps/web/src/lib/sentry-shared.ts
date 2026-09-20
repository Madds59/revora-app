import type { ErrorEvent, EventHint } from "@sentry/nextjs";

import { isControlFlowError } from "@/lib/observability-context.js";

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
