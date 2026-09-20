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
