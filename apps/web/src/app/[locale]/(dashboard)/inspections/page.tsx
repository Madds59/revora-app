import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireMembership } from "@/lib/auth";
import { formatDate } from "@/lib/formatters";
import { listStaffInspections } from "@/lib/inspections/data";
import { canManageInspections } from "@/lib/permissions";

export default async function InspectionsPage() {
  const t = await getTranslations("dashboardInspections");
  const tShared = await getTranslations("inspections");
  const locale = await getLocale();
  const { member, business } = await requireMembership();

  const inspections = await listStaffInspections(business.id);
  const canManage = canManageInspections(member.role);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
          canManage ? (
            <Link href="/inspections/new" className={buttonVariants()}>
              {t("new.submit")}
            </Link>
          ) : null
        }
      />
      <div className="space-y-4 p-6">
        {inspections.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="size-5" />}
            title={t("empty.title")}
            description={t("empty.description")}
          />
        ) : (
          <>
            <MobileDataList
              items={inspections}
              empty={null}
              getKey={(i) => i.id}
              renderItem={(i) => (
                <MobileDataCard
                  title={
                    <Link
                      href={`/inspections/${i.id}`}
                      className="hover:underline"
                    >
                      {i.vehicleLabel}
                    </Link>
                  }
                  subtitle={`${i.customerName} · ${formatDate(i.createdAt, undefined, locale)}`}
                  meta={
                    <Badge
                      variant={i.status === "completed" ? "default" : "secondary"}
                    >
                      {tShared(`status.${i.status}`)}
                    </Badge>
                  }
                />
              )}
            />

            <div className="hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("list.vehicle")}</TableHead>
                    <TableHead>{t("list.customer")}</TableHead>
                    <TableHead>{t("list.started")}</TableHead>
                    <TableHead>{t("list.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inspections.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <Link
                          href={`/inspections/${i.id}`}
                          className="font-medium hover:underline"
                        >
                          {i.vehicleLabel}
                        </Link>
                      </TableCell>
                      <TableCell>{i.customerName}</TableCell>
                      <TableCell>
                        {formatDate(i.createdAt, undefined, locale)}
                      </TableCell>
                      <TableCell className="space-x-2">
                        <Badge
                          variant={
                            i.status === "completed" ? "default" : "secondary"
                          }
                        >
                          {tShared(`status.${i.status}`)}
                        </Badge>
                        <Badge variant="outline">
                          {tShared(
                            `context.${i.context === "in_job" ? "inJob" : "preQuote"}`,
                          )}
                        </Badge>
                        {i.quotationId && (
                          <Badge variant="outline">{t("list.quoted")}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
