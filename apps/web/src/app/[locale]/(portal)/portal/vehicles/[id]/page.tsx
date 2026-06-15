import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireCustomerPortal } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/formatters";
import { createClient } from "@/lib/supabase/server";
import { getVehiclePortalSnapshot } from "@/lib/vehicle-intelligence/service";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return {
    title: t("portalVehicleTitle"),
    description: t("portalVehicleDescription"),
  };
}

export default async function PortalVehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("vehicleIntelligence");
  const { accounts } = await requireCustomerPortal();
  const snapshot = await getVehiclePortalSnapshot(id);
  if (snapshot.error || !snapshot.data) notFound();
  const snapshotData = snapshot.data;

  if (!accounts.some((account) => account.id === snapshotData.customerId)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: mediaRows } = await supabase
    .from("vehicle_media_uploads")
    .select("id, storage_bucket, storage_path, media_type, description, created_at")
    .eq("vehicle_id", id)
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader
        title={[snapshotData.vehicleMake, snapshotData.vehicleModel].filter(Boolean).join(" ") || snapshotData.plateNumber || snapshotData.vin || t("portal.vehicleFallback")}
        description={snapshotData.businessName}
        action={
          <Link href="/portal/ai/health-check" className={buttonVariants()}>
            {t("portal.healthCheckAction")}
          </Link>
        }
      />

      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("portal.vehicleSummaryTitle")}</CardTitle>
            <CardDescription>{t("portal.vehicleSummaryDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [t("portal.customer"), snapshotData.customerName ?? "—"],
              [t("portal.plate"), snapshotData.plateNumber ?? "—"],
              [t("portal.vin"), snapshotData.vin ?? "—"],
              [t("portal.latestSeverity"), snapshotData.latestDiagnosticSeverity ?? t("portal.noDiagnosticYet")],
              [t("portal.stopDriving"), snapshotData.stopDrivingWarning ? t("portal.yes") : t("portal.no")],
              [t("portal.nextService"), snapshotData.nextServiceDate ? formatDate(snapshotData.nextServiceDate) : "—"],
            ].map(([label, value]) => (
              <div key={label} className="space-y-1">
                <div className="text-muted-foreground text-xs uppercase tracking-wide">{label}</div>
                <div className="text-sm">{value}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        {snapshotData.customerExplanation ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("portal.customerExplanationTitle")}</CardTitle>
              <CardDescription>{t("portal.customerExplanationDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm leading-6">{snapshotData.customerExplanation}</p>
              {snapshotData.stopDrivingWarning && (
                <Badge variant="destructive">{t("portal.stopDrivingWarning")}</Badge>
              )}
            </CardContent>
          </Card>
        ) : (
          <EmptyState title={t("portal.noDiagnosticYet")} description={t("portal.noDiagnosticDescription")} />
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t("portal.mediaTitle")}</CardTitle>
            <CardDescription>{t("portal.mediaDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {mediaRows?.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {mediaRows.map((row) => (
                  <div key={row.id} className="rounded-lg border p-3 text-sm">
                    <div className="font-medium">{row.description ?? row.storage_path}</div>
                    <div className="text-muted-foreground text-xs">{row.media_type}</div>
                    <div className="text-muted-foreground mt-1 text-xs">{formatDateTime(row.created_at)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title={t("portal.noMediaTitle")} description={t("portal.noMediaDescription")} />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
