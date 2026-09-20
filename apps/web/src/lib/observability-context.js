/**
 * Pure helpers for error reporting. Kept in plain JS so `node --test` can
 * import them directly (see tests/observability.test.mjs).
 *
 * @typedef {{ section?: string; route?: string; businessId?: string; digest?: string }} ReportTagInput
 */

/** Allow-list: only these keys ever become Sentry tags. Ids only, never PII. */
const TAG_MAP = /** @type {const} */ ({
  section: "section",
  route: "route",
  businessId: "business_id",
  digest: "digest",
});

/**
 * @param {ReportTagInput | undefined} ctx
 * @returns {Record<string, string>}
 */
export function buildReportTags(ctx) {
  /** @type {Record<string, string>} */
  const tags = {};
  if (!ctx) return tags;
  for (const [from, to] of Object.entries(TAG_MAP)) {
    const value = /** @type {Record<string, unknown>} */ (ctx)[from];
    if (value !== undefined && value !== null && value !== "") {
      tags[to] = String(value);
    }
  }
  return tags;
}

/**
 * @param {ReportTagInput | undefined} ctx
 * @returns {string}
 */
export function formatConsoleLine(ctx) {
  const parts = Object.entries(buildReportTags(ctx)).map(([k, v]) => `${k}=${v}`);
  return parts.length ? `[revora:error] ${parts.join(" ")}` : "[revora:error]";
}

const MAX_EXTRA_STRING_LENGTH = 64;

/**
 * Keep only values shaped like ids/counts/flags — never PII. Drops objects,
 * arrays, null/undefined, over-long strings, and strings that look like an
 * email address.
 *
 * @param {Record<string, unknown> | undefined} extra
 * @returns {Record<string, unknown>}
 */
export function sanitizeExtra(extra) {
  /** @type {Record<string, unknown>} */
  const clean = {};
  if (!extra) return clean;
  for (const [key, value] of Object.entries(extra)) {
    if (typeof value === "number" || typeof value === "boolean") {
      clean[key] = value;
      continue;
    }
    if (typeof value === "string" && value.length <= MAX_EXTRA_STRING_LENGTH && !value.includes("@")) {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Strip query strings and redact share tokens from a URL or path.
 *
 * @param {string | undefined} value
 * @returns {string | undefined}
 */
export function scrubUrl(value) {
  if (typeof value !== "string") return value;
  const noQuery = value.split(/[?#]/)[0];
  return noQuery.replace(/\/i\/[^/]+/g, "/i/[redacted]");
}

/** Next.js control-flow "errors" that must never be reported. */
/**
 * Postgres constraint errors embed the offending row values:
 *   `Key (phone)=(+9715…) already exists.`
 *   `Key (business_id, plate_number)=(b1, A 12345) already exists.`
 * The column list is diagnostic; the value tuple is customer data. Redact
 * only the value half so the message stays useful.
 *
 * @param {string | undefined} message
 * @returns {string | undefined}
 */
export function scrubConstraintValues(message) {
  if (typeof message !== "string") return message;
  return message.replace(/(Key \([^)]*\)=)\([^)]*\)/g, "$1([redacted])");
}

export const CONTROL_FLOW_DIGESTS = ["NEXT_REDIRECT", "NEXT_NOT_FOUND", "NEXT_HTTP_ERROR_FALLBACK"];

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isControlFlowError(error) {
  if (!error || typeof error !== "object") return false;
  const digest = /** @type {{ digest?: unknown }} */ (error).digest;
  const message = /** @type {{ message?: unknown }} */ (error).message;
  return CONTROL_FLOW_DIGESTS.some(
    (code) =>
      (typeof digest === "string" && digest.startsWith(code)) ||
      (typeof message === "string" && message.startsWith(code)),
  );
}
