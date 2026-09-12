import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { InspectionReport } from "@/components/inspection-report";
import { PageHeader } from "@/components/page-header";
import { requireCustomerPortal } from "@/lib/auth";
import { formatDate } from "@/lib/formatters";
import { getPortalInspection } from "@/lib/inspections/data";

export default async function PortalInspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("portalInspections");
  const locale = await getLocale();
  const { accounts } = await requireCustomerPortal();

  const inspection = await getPortalInspection(
    id,
    accounts.map((account) => account.id),
  );

  // Same response for "no such report", "not yours" and "still a draft" -- the
  // portal must not become an oracle for inspection ids.
  if (!inspection) {
    return (
      <>
        <PageHeader title={t("title")} />
        <div className="p-6">
          <p className="text-muted-foreground text-sm">{t("notFound")}</p>
          <Link
            href="/portal/inspections"
            className="text-primary mt-2 inline-block text-sm underline underline-offset-4"
          >
            {t("back")}
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={inspection.vehicleLabel || t("title")}
        description={inspection.businessName}
      />
      <div className="space-y-6 p-6">
        <dl className="text-sm sm:grid sm:grid-cols-3 sm:gap-4">
          {inspection.completedAt && (
            <div className="space-y-0.5">
              <dt className="text-muted-foreground text-xs">{t("title")}</dt>
              <dd>
                {t("completedOn", {
                  date: formatDate(inspection.completedAt, undefined, locale),
                })}
              </dd>
            </div>
          )}
          {inspection.odometerReading != null && (
            <div className="space-y-0.5">
              <dt className="text-muted-foreground text-xs">{t("odometer")}</dt>
              <dd>{inspection.odometerReading.toLocaleString(locale)}</dd>
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
          namespace="portalInspections"
        />

        <Link
          href="/portal/inspections"
          className="text-primary inline-block text-sm underline underline-offset-4"
        >
          {t("back")}
        </Link>
      </div>
    </>
  );
}
