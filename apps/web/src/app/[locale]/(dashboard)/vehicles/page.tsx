import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { getTranslations } from "next-intl/server";
import { requireMembership } from "@/lib/auth";
import { canManageCustomers } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Job, Vehicle } from "@/lib/database.types";

import { VehiclesBrowser, type VehicleListRow } from "./vehicles-browser";

type VehicleLookupRow = Pick<
  Vehicle,
  | "id"
  | "customer_id"
  | "make"
  | "model"
  | "year"
  | "plate_number"
  | "vin"
  | "color"
  | "created_at"
  | "updated_at"
> & {
  customer: {
    id: string;
    full_name: string;
    email: string | null;
  } | null;
};

type JobLookupRow = Pick<
  Job,
  "customer_id" | "created_at" | "updated_at" | "completed_at"
>;

export default async function VehiclesPage() {
  const t = await getTranslations("dashboardVehicles");
  const { member, business } = await requireMembership();
  const canCreate = canManageCustomers(member.role);
  const supabase = await createClient();

  const [{ data: vehicleRows, error: vehicleError }, { data: jobRows, error: jobError }] =
    await Promise.all([
      supabase
        .from("vehicles")
        .select(
          "id, customer_id, make, model, year, plate_number, vin, color, created_at, updated_at, customer:customers(id, full_name, email)",
        )
        .eq("business_id", business.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("jobs")
        .select("customer_id, created_at, updated_at, completed_at")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false }),
    ]);

  if (vehicleError || jobError) {
    return (
      <>
        <PageHeader
          title={t("title")}
          description={t("description")}
        />
        <div className="p-6">
          <ErrorState
            title={t("error.title")}
            description={t("error.description")}
            backHref="/"
            backLabel={t("error.backLabel")}
          />
        </div>
      </>
    );
  }

  const jobs = (jobRows ?? []) as JobLookupRow[];
  const lastServiceByCustomer = new Map<string, string>();
  for (const job of jobs) {
    const candidate = job.completed_at ?? job.updated_at ?? job.created_at;
    const existing = lastServiceByCustomer.get(job.customer_id);
    if (!existing || new Date(candidate) > new Date(existing)) {
      lastServiceByCustomer.set(job.customer_id, candidate);
    }
  }

  const vehicles: VehicleListRow[] = ((vehicleRows ?? []) as unknown as VehicleLookupRow[]).map((vehicle) => ({
    ...vehicle,
    last_service_at: lastServiceByCustomer.get(vehicle.customer_id) ?? null,
  }));

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />
      <div className="p-6">
        <VehiclesBrowser vehicles={vehicles} canCreate={canCreate} />
      </div>
    </>
  );
}
