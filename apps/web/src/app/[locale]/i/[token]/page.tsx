import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { InspectionReport } from "@/components/inspection-report";
import { formatDate } from "@/lib/formatters";
import { getPublicInspection } from "@/lib/inspections/data";
import { hashPresentedShareToken } from "@/lib/inspections/share";

/**
 * Public inspection share page -- the application's only unauthenticated data
 * surface (spec section 13).
 *
 * Rules this file exists to keep:
 *
 *  - The token is NEVER logged, never put in an error message, never sent to
 *    analytics, and never used as a React key or anything else that could end
 *    up serialised into the page.
 *  - Only its SHA-256 digest reaches the database, via the two resolver RPCs
 *    (the only functions granted to `anon`).
 *  - Unknown, malformed, expired and revoked tokens all render the SAME page.
 *    There is no 404-vs-410 distinction, no timing branch worth measuring, and
 *    no message that says which of the four happened. A visitor cannot use this
 *    route to learn whether an inspection exists.
 *  - Photos are signed only AFTER the token resolves.
 *
 * `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer` and
 * `X-Robots-Tag` are attached in middleware (lib/supabase/middleware.ts), which
 * also carries the exact-shape route exemption.
 */

// Never prerender or cache: the response is specific to a secret in the path.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("publicInspection");
  return {
    title: t("title"),
    // Belt and braces alongside the X-Robots-Tag header from middleware.
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function PublicInspectionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("publicInspection");
  const locale = await getLocale();

  // Returns null for anything that is not exactly 43 base64url characters, so a
  // malformed token costs no database round trip -- and lands on the same
  // "unavailable" render as a revoked one.
  const tokenHash = hashPresentedShareToken(token);
  const inspection = tokenHash ? await getPublicInspection(tokenHash) : null;

  if (!inspection) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold tracking-tight">
          {t("unavailable.title")}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          {t("unavailable.description")}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {inspection.businessName}
        </p>
      </header>

      <dl className="text-sm sm:grid sm:grid-cols-3 sm:gap-4">
        <div className="space-y-0.5">
          <dt className="text-muted-foreground text-xs">{t("vehicle")}</dt>
          <dd>{inspection.vehicleLabel}</dd>
        </div>
        {inspection.completedAt && (
          <div className="space-y-0.5">
            <dt className="text-muted-foreground text-xs">
              {t("completedOn")}
            </dt>
            <dd>{formatDate(inspection.completedAt, undefined, locale)}</dd>
          </div>
        )}
      </dl>

      {inspection.summary && (
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{t("summary")}</h2>
          <p className="text-muted-foreground text-sm leading-6">
            {inspection.summary}
          </p>
        </div>
      )}

      <InspectionReport
        items={inspection.items}
        namespace="publicInspection"
      />

      <p className="text-muted-foreground border-t pt-4 text-xs leading-5">
        {t("privacyNote")}
      </p>
    </main>
  );
}
