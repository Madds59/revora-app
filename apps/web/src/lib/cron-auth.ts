import "server-only";

import crypto from "node:crypto";

/**
 * Shared-secret authentication for scheduled system endpoints.
 *
 * These routes run with the service role and have no user session, so the
 * secret is the only gate. Comparison is constant-time after a length check,
 * matching verifyStripeWebhookSignature and the notification dispatch route: a
 * `!==` on a secret short-circuits at the first differing byte and leaks its
 * prefix to anyone who can time the response.
 *
 * Two callers are supported deliberately:
 *
 *  - Vercel Cron, which invokes with GET and `Authorization: Bearer $CRON_SECRET`.
 *    That convention is fixed by the platform, not chosen here.
 *  - A manual or external trigger (an operator, or a scheduled GitHub Action
 *    where the deployment plan cannot run crons frequently enough), using a
 *    route-specific header.
 *
 * Neither secret is ever logged, echoed, or included in a response body.
 */

function constantTimeEquals(provided: string | null | undefined, expected: string | undefined) {
  if (!expected || !provided) return false;
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  // timingSafeEqual throws on a length mismatch, and length is not the secret.
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

/** Extracts the bearer token from an Authorization header, or null. */
function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * True when the request carries either the platform cron secret or the
 * route-specific shared secret.
 */
export function isAuthorizedCronRequest(
  request: Request,
  { headerName, headerSecret }: { headerName: string; headerSecret: string | undefined },
): boolean {
  if (constantTimeEquals(request.headers.get(headerName), headerSecret)) return true;
  return constantTimeEquals(
    bearerToken(request.headers.get("authorization")),
    process.env.CRON_SECRET,
  );
}
