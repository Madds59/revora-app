import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/formatters";
import { requireCustomerPortal } from "@/lib/auth";
import { getVehiclePortalSnapshot } from "@/lib/vehicle-intelligence/service";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return {
    title: t("portalVehiclesTitle"),
    description: t("portalVehiclesDescription"),
  };
}

export default async function PortalVehiclesPage() {
  const t = await getTranslations("vehicleIntelligence");
  const { accounts } = await requireCustomerPortal();
  if (accounts.length === 0) {
    return (
      <>
        <PageHeader title={t("portal.vehiclesTitle")} description={t("portal.vehiclesDescription")} />
        <div className="p-6">
          <EmptyState
            title={t("portal.noLinkedVehiclesTitle")}
            description={t("portal.noLinkedVehiclesDescription")}
            action={
              <Link href="/portal/ai/health-check" className={buttonVariants({ variant: "outline" })}>
                {t("portal.healthCheckAction")}
              </Link>
            }
          />
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const customerIds = accounts.map((account) => account.id);
  const { data: vehicleRows } = customerIds.length
    ? await supabase
        .from("vehicles")
        .select("id")
        .in("customer_id", customerIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const snapshots = (
    await Promise.all((vehicleRows ?? []).map((vehicle) => getVehiclePortalSnapshot(vehicle.id)))
  )
    .map((item) => item.data)
    .filter(Boolean);

  return (
    <>
      <PageHeader
        title={t("portal.vehiclesTitle")}
        description={t("portal.vehiclesDescription")}
        action={
          <Link href="/portal/ai/health-check" className={buttonVariants()}>
            {t("portal.healthCheckAction")}
          </Link>
        }
      />
      <div className="grid gap-4 p-6 md:grid-cols-2">
        {snapshots.length === 0 ? (
          <div className="md:col-span-2">
            <EmptyState
              title={t("portal.noLinkedVehiclesTitle")}
              description={t("portal.noLinkedVehiclesDescription")}
            />
          </div>
        ) : (
          snapshots.map((snapshot) => (
            <Card key={snapshot!.vehicleId}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <span>{[snapshot!.vehicleMake, snapshot!.vehicleModel].filter(Boolean).join(" ") || snapshot!.plateNumber || snapshot!.vin || t("portal.vehicleFallback")}</span>
                  <span className="text-muted-foreground text-xs">{snapshot!.businessName}</span>
                </CardTitle>
                <CardDescription>
                  {snapshot!.customerName ?? t("portal.linkedVehicle")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="text-muted-foreground text-xs">
                  {t("portal.lastUpdate")}: {formatDateTime(snapshot!.latestReportCreatedAt)}
                </div>
                <div className="text-muted-foreground text-sm">
                  {snapshot!.latestDiagnosticSeverity
                    ? `${t("portal.latestSeverity")}: ${snapshot!.latestDiagnosticSeverity}`
                    : t("portal.noDiagnosticYet")}
                </div>
                <Link
                  href={`/portal/vehicles/${snapshot!.vehicleId}`}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  {t("portal.viewVehicle")}
                </Link>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
