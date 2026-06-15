import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { canManageCustomers } from "@/lib/permissions";

import { VehicleDiagnosisForm } from "./vehicle-diagnosis-form";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return {
    title: t("vehicleIntelligenceDiagnosisTitle"),
    description: t("vehicleIntelligenceDiagnosisDescription"),
  };
}

export default async function VehicleDiagnosisPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle_id?: string }>;
}) {
  const t = await getTranslations("vehicleIntelligence");
  const params = await searchParams;
  const { member, business } = await requireMembership();
  if (!canManageCustomers(member.role)) {
    return (
      <>
        <PageHeader title={t("diagnosis.title")} description={t("diagnosis.description")} />
        <div className="p-6">
          <p className="text-sm text-muted-foreground">{t("diagnosis.noAccess")}</p>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const { data: vehicleRows } = await supabase
    .from("vehicles")
    .select("id, customer_id, make, model, year, plate_number, vin, customer:customers(full_name, email)")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  const vehicles =
    (vehicleRows ?? []).map((vehicle) => ({
      id: vehicle.id,
      label:
        [vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
        vehicle.plate_number ||
        vehicle.vin ||
        t("diagnosis.vehicleFallback"),
      detail: [vehicle.customer?.full_name, vehicle.customer?.email].filter(Boolean).join(" · "),
      customerId: vehicle.customer_id,
    })) ?? [];

  return (
    <>
      <PageHeader title={t("diagnosis.title")} description={t("diagnosis.description")} />
      <div className="p-6">
        <VehicleDiagnosisForm
          initialVehicleId={params.vehicle_id ?? ""}
          vehicles={vehicles}
        />
      </div>
    </>
  );
}
