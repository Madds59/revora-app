import type { ErrorEvent, EventHint } from "@sentry/nextjs";

import { isControlFlowError, scrubUrl } from "@/lib/observability-context.js";

/**
 * Drop control-flow errors, strip request bodies/cookies/headers, scrub
 * query strings and share tokens out of any URL/path the event carries, and
 * drop console breadcrumbs that look like they contain an email address.
 */
export function beforeSend(event: ErrorEvent, hint: EventHint): ErrorEvent | null {
  if (isControlFlowError(hint.originalException)) return null;

  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    event.request.url = scrubUrl(event.request.url);
  }
  event.user = undefined;

  const nextjsContext = event.contexts?.nextjs;
  if (nextjsContext && typeof nextjsContext === "object") {
    const requestPath = (nextjsContext as Record<string, unknown>).request_path;
    if (typeof requestPath === "string") {
      (nextjsContext as Record<string, unknown>).request_path = scrubUrl(requestPath);
    }
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .filter((b) => !(b.category === "console" && typeof b.message === "string" && b.message.includes("@")))
      .map((b) => {
        if (b.category !== "navigation" || !b.data || typeof b.data !== "object") return b;
        const data: Record<string, unknown> = { ...b.data };
        if (typeof data.from === "string") data.from = scrubUrl(data.from);
        if (typeof data.to === "string") data.to = scrubUrl(data.to);
        return { ...b, data };
      });
  }
  return event;
}
