import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { PageHeader } from "@/components/page-header";
import { requireCustomerPortal } from "@/lib/auth";
import { formatDate } from "@/lib/formatters";
import { listPortalInspections } from "@/lib/inspections/data";

/**
 * Customer-facing list of inspection reports.
 *
 * Only COMPLETED inspections belonging to this session's own customer records
 * are queried -- draft work in the bay is never visible, and the read model
 * (lib/inspections/data.ts) selects no internal column at all.
 */
export default async function PortalInspectionsPage() {
  const t = await getTranslations("portalInspections");
  const locale = await getLocale();
  const { accounts } = await requireCustomerPortal();

  const inspections = await listPortalInspections(
    accounts.map((account) => account.id),
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="p-6">
        {inspections.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="size-5" />}
            title={t("empty.title")}
            description={t("empty.description")}
          />
        ) : (
          <MobileDataList
            items={inspections}
            empty={null}
            getKey={(i) => i.id}
            renderItem={(i) => (
              <MobileDataCard
                title={
                  <Link
                    href={`/portal/inspections/${i.id}`}
                    className="hover:underline"
                  >
                    {i.vehicleLabel}
                  </Link>
                }
                subtitle={i.businessName}
                meta={
                  <span className="text-muted-foreground text-xs">
                    {i.completedAt
                      ? t("completedOn", {
                          date: formatDate(i.completedAt, undefined, locale),
                        })
                      : ""}
                  </span>
                }
              />
            )}
          />
        )}
      </div>
    </>
  );
}
