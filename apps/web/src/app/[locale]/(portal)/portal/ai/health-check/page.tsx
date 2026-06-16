import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { requireCustomerPortal } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatVehicleLabel } from "@/lib/vehicle-intelligence/labels";

import { PortalHealthCheckForm } from "./portal-health-check-form";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return {
    title: t("portalHealthCheckTitle"),
    description: t("portalHealthCheckDescription"),
  };
}

export default async function PortalHealthCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle_id?: string }>;
}) {
  const t = await getTranslations("vehicleIntelligence");
  const params = await searchParams;
  const { accounts } = await requireCustomerPortal();
  const supabase = await createClient();
  const vehicleIds = accounts.map((account) => account.id);
  const { data } = vehicleIds.length
    ? await supabase
        .from("vehicles")
        .select("id, make, model, year, plate_number, vin, customer_id")
        .in("customer_id", vehicleIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const vehicles =
    (data ?? []).map((vehicle) => ({
      id: vehicle.id,
      label: formatVehicleLabel(vehicle, t("portal.vehicleFallback"), t("unknownVehicle")),
      detail: vehicle.vin ?? t("portal.linkedVehicle"),
      customerId: vehicle.customer_id,
    })) ?? [];

  return (
    <>
      <PageHeader title={t("portal.healthCheckTitle")} description={t("portal.healthCheckDescription")} />
      <div className="p-6">
        <PortalHealthCheckForm initialVehicleId={params.vehicle_id ?? ""} vehicles={vehicles} />
      </div>
    </>
  );
}
