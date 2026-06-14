import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { canManageCustomers } from "@/lib/permissions";

import { DtcDecoderForm } from "./dtc-decoder-form";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return {
    title: t("vehicleIntelligenceDtcTitle"),
    description: t("vehicleIntelligenceDtcDescription"),
  };
}

export default async function DtcDecoderPage({
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
        <PageHeader title={t("dtc.title")} description={t("dtc.description")} />
        <div className="p-6">
          <p className="text-sm text-muted-foreground">{t("dtc.noAccess")}</p>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("vehicles")
    .select("id, make, model, year, plate_number, vin, customer:customers(full_name)")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  const vehicles =
    (data ?? []).map((vehicle) => ({
      id: vehicle.id,
      label:
        [vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
        vehicle.plate_number ||
        vehicle.vin ||
        t("dtc.vehicleFallback"),
      detail: [vehicle.customer?.full_name, vehicle.year].filter(Boolean).join(" · "),
    })) ?? [];

  return (
    <>
      <PageHeader title={t("dtc.title")} description={t("dtc.description")} />
      <div className="p-6">
        <DtcDecoderForm initialVehicleId={params.vehicle_id ?? ""} vehicles={vehicles} />
      </div>
    </>
  );
}
