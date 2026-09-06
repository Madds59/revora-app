import { EmptyState } from "@/components/empty-state";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireMembership } from "@/lib/auth";
import { canViewMaintenance } from "@/lib/permissions";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/formatters";
import { loadMaintenanceWorklist, type WorklistRow } from "@/lib/maintenance/worklist";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  due_soon: "default",
  overdue: "destructive",
  upcoming: "secondary",
};

/**
 * How the due date was arrived at, in plain language.
 *
 * The underlying plan is AI-generated and the date may be projected from
 * recorded mileage, so staff are told which it is. Raw confidence internals
 * stay out of the UI.
 */
function basisLabel(row: WorklistRow, locale: string): string {
  const ar = locale === "ar";
  switch (row.projectionBasis) {
    case "mileage_observed":
      return ar ? "مقدّر من المسافة المسجلة" : "Estimated from recorded mileage";
    case "mileage_assumed":
      return ar ? "مقدّر من متوسط قيادة مُعد" : "Estimated from a configured driving average";
    case "date_only":
      return ar ? "من تاريخ الخدمة المقترح" : "From the suggested service date";
    default:
      return "—";
  }
}

function statusLabel(status: string, locale: string): string {
  const ar = locale === "ar";
  if (status === "overdue") return ar ? "متأخرة" : "Overdue";
  if (status === "due_soon") return ar ? "قريباً" : "Due soon";
  return ar ? "قادمة" : "Upcoming";
}

export default async function MaintenancePage() {
  const t = await getTranslations("dashboardMaintenance");
  const tError = await getTranslations("error");
  const locale = await getLocale();
  const { member, business } = await requireMembership();

  // Server-side gate in addition to RLS; the page never renders for a role that
  // should not see customer vehicle data.
  if (!canViewMaintenance(member.role)) {
    return (
      <>
        <PageHeader title={t("title")} description={t("description")} />
        <div className="p-6">
          <EmptyState title={t("restricted.title")} description={t("restricted.description")} />
        </div>
      </>
    );
  }

  let rows: WorklistRow[] = [];
  let failed = false;
  try {
    rows = await loadMaintenanceWorklist(business.id);
  } catch (error) {
    failed = true;
    console.error("MaintenancePage failed to load", error);
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="p-6">
        {failed ? (
          <p className="text-destructive text-sm">{tError("description")}</p>
        ) : rows.length === 0 ? (
          <EmptyState title={t("empty.title")} description={t("empty.description")} />
        ) : (
          <>
            <MobileDataList
              items={rows}
              empty={null}
              getKey={(row) => row.vehicleId}
              renderItem={(row) => (
                <MobileDataCard
                  title={row.vehicleLabel}
                  subtitle={`${row.customerName} · ${formatDate(row.effectiveDueDate, undefined, locale)}`}
                  meta={
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>
                        {statusLabel(row.status, locale)}
                      </Badge>
                      {row.suppressed && (
                        <Badge variant="outline">{t("badges.booked")}</Badge>
                      )}
                    </div>
                  }
                />
              )}
            />

            <div className="hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.vehicle")}</TableHead>
                    <TableHead>{t("table.customer")}</TableHead>
                    <TableHead>{t("table.due")}</TableHead>
                    <TableHead>{t("table.basis")}</TableHead>
                    <TableHead className="text-end">{t("table.lastMileage")}</TableHead>
                    <TableHead>{t("table.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.vehicleId}>
                      <TableCell className="font-medium">{row.vehicleLabel}</TableCell>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell>{formatDate(row.effectiveDueDate, undefined, locale)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {basisLabel(row, locale)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {row.latestMileage === null ? "—" : `${row.latestMileage.toLocaleString()} km`}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>
                            {statusLabel(row.status, locale)}
                          </Badge>
                          {row.suppressed && (
                            <Badge variant="outline">{t("badges.booked")}</Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <p className="text-muted-foreground mt-4 text-xs">{t("estimateNote")}</p>
          </>
        )}
      </div>
    </>
  );
}
