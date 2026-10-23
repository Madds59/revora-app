import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireMembership } from "@/lib/auth";
import { formatDate } from "@/lib/formatters";
import { getStaffInspection } from "@/lib/inspections/data";
import {
  countChecked,
  groupBySection,
  isQuotable,
} from "@/lib/inspections/results";
import {
  canManageInspections,
  canManageQuotes,
  canShareInspections,
} from "@/lib/permissions";
import { PRIVATE_BUCKET } from "@/lib/storage";

import {
  CompleteInspectionForm,
  FindingsForm,
  ShareControls,
} from "../inspection-controls";
import { InspectionEditor } from "../inspection-editor";

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("dashboardInspections");
  const tShared = await getTranslations("inspections");
  const locale = await getLocale();
  const { member, business } = await requireMembership();

  const inspection = await getStaffInspection(id, business.id);
  if (!inspection) {
    return (
      <>
        <PageHeader title={t("title")} />
        <div className="p-6">
          <p className="text-muted-foreground text-sm">{t("detail.notFound")}</p>
          <Link
            href="/inspections"
            className="text-primary mt-2 inline-block text-sm underline underline-offset-4"
          >
            {t("detail.back")}
          </Link>
        </div>
      </>
    );
  }

  const isDraft = inspection.status === "draft";
  const editable = isDraft && canManageInspections(member.role);
  const checked = countChecked(inspection.items);
  const sections = groupBySection(inspection.items);
  const findings = inspection.items.filter((i) => isQuotable(i.result));

  return (
    <>
      <PageHeader
        title={inspection.vehicleLabel || t("title")}
        description={inspection.customerName}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isDraft ? "secondary" : "default"}>
              {tShared(`status.${inspection.status}`)}
            </Badge>
            <Badge variant="outline">
              {tShared(
                `context.${inspection.context === "in_job" ? "inJob" : "preQuote"}`,
              )}
            </Badge>
          </div>
        }
      />

      <div className="space-y-6 p-6">
        <dl className="text-sm sm:grid sm:grid-cols-3 sm:gap-4">
          <div className="space-y-0.5">
            <dt className="text-muted-foreground text-xs">
              {t("detail.started")}
            </dt>
            <dd>{formatDate(inspection.createdAt, undefined, locale)}</dd>
          </div>
          {inspection.completedAt && (
            <div className="space-y-0.5">
              <dt className="text-muted-foreground text-xs">
                {t("detail.completedOn")}
              </dt>
              <dd>{formatDate(inspection.completedAt, undefined, locale)}</dd>
            </div>
          )}
          {inspection.odometerReading != null && (
            <div className="space-y-0.5">
              <dt className="text-muted-foreground text-xs">
                {t("detail.odometer")}
              </dt>
              <dd>
                {inspection.odometerReading.toLocaleString(locale)}{" "}
                {t("detail.kmSuffix")}
              </dd>
            </div>
          )}
        </dl>

        {inspection.summary && (
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">{t("detail.summary")}</h2>
            <p className="text-muted-foreground text-sm leading-6">
              {inspection.summary}
            </p>
          </div>
        )}

        <p className="text-muted-foreground text-xs leading-5">
          {tShared("notAStandard")}
        </p>

        <InspectionEditor
          inspectionId={inspection.id}
          businessId={business.id}
          bucket={PRIVATE_BUCKET}
          sections={sections}
          editable={editable}
          checked={checked}
          total={inspection.items.length}
        />

        {isDraft && canManageInspections(member.role) && (
          <Card>
            <CardHeader>
              <CardTitle>{t("complete.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <CompleteInspectionForm
                inspectionId={inspection.id}
                uncheckedCount={inspection.items.length - checked}
              />
            </CardContent>
          </Card>
        )}

        {!isDraft && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t("findings.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <FindingsForm
                  inspectionId={inspection.id}
                  findings={findings}
                  quotationId={inspection.quotationId}
                  canQuote={canManageQuotes(member.role)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("share.title")}</CardTitle>
                <CardDescription>{t("share.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                {canShareInspections(member.role) ? (
                  <ShareControls
                    inspectionId={inspection.id}
                    share={inspection.share}
                  />
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {t("share.noPermission")}
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
