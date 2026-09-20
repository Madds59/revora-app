import { buildReportTags, formatConsoleLine } from "@/lib/observability-context.js";

export type ReportContext = {
  section?: string;
  route?: string;
  /** Tenant id only — never a business name. */
  businessId?: string;
  digest?: string;
  /** Free-form, non-PII diagnostics (counts, enum values, ids). */
  extra?: Record<string, unknown>;
};

const hasDsn = !!(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN);

/**
 * Single entry point for "something failed that a human should know about".
 * Safe on server and client. Without a DSN this is a structured console.error
 * (today's behaviour); with one it also reaches Sentry with ids-only tags.
 */
export function reportError(error: unknown, ctx?: ReportContext): void {
  const tags = buildReportTags(ctx);
  console.error(formatConsoleLine(ctx), error);
  if (!hasDsn) return;

  // Lazy import keeps @sentry/nextjs out of every bundle that never reports.
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.withScope((scope) => {
      scope.setTags(tags);
      if (ctx?.extra) scope.setContext("extra", ctx.extra);
      Sentry.captureException(error);
    });
  });
}
