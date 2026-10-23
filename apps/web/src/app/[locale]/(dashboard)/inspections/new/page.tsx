import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { requireMembership } from "@/lib/auth";
import { listInspectionTemplates } from "@/lib/inspections/data";
import { canManageInspections } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

import {
  StartInspectionForm,
  type VehicleOption,
} from "../start-inspection-form";

/** `Make Model · PLATE`, with each part omitted when the column is null. */
function label(v: {
  make: string | null;
  model: string | null;
  plate_number: string | null;
}): string {
  const name = [v.make, v.model].filter(Boolean).join(" ").trim();
  return [name || null, v.plate_number].filter(Boolean).join(" · ");
}

/**
 * The single "start an inspection" screen, reached from three places:
 *
 *   /inspections/new                 -- pick any vehicle (list page)
 *   /inspections/new?vehicle=<id>    -- pre-quote, from the vehicle record
 *   /inspections/new?job=<id>        -- in-job, from an active job
 *
 * One screen rather than three keeps the navigation flat: the existing IA
 * already has a lot of top-level entries, so DVI adds exactly one nav item and
 * contextual buttons that deep-link into it.
 */
export default async function NewInspectionPage({
  searchParams,
}: {
  searchParams: Promise<{
    vehicle?: string;
    job?: string;
    appointment?: string;
  }>;
}) {
  const t = await getTranslations("dashboardInspections.new");
  const { member, business } = await requireMembership();
  if (!canManageInspections(member.role)) {
    return (
      <>
        <PageHeader title={t("title")} />
        <div className="p-6">
          <p className="text-muted-foreground text-sm">{t("noPermission")}</p>
        </div>
      </>
    );
  }

  const params = await searchParams;
  const supabase = await createClient();

  // Every anchor is re-resolved inside this business. A query string is
  // untrusted input: an id that does not resolve here is treated as absent
  // rather than passed through to the RPC.
  let lockedVehicleId: string | undefined;
  let jobId: string | undefined;

  if (params.job) {
    const { data: job } = await supabase
      .from("jobs")
      .select("id, customer_id, quotation_id")
      .eq("business_id", business.id)
      .eq("id", params.job)
      .maybeSingle();
    if (!job) notFound();
    jobId = job.id;

    // Jobs carry no vehicle of their own; it comes from the approved quote.
    if (job.quotation_id) {
      const { data: quote } = await supabase
        .from("quotations")
        .select("vehicle_id")
        .eq("business_id", business.id)
        .eq("id", job.quotation_id)
        .maybeSingle();
      lockedVehicleId = quote?.vehicle_id ?? undefined;
    }
  }

  let appointmentId: string | undefined;
  if (params.appointment) {
    const { data: appointment } = await supabase
      .from("appointments")
      .select("id")
      .eq("business_id", business.id)
      .eq("id", params.appointment)
      .maybeSingle();
    // An unresolvable appointment is dropped rather than rejected: the
    // inspection itself is still valid without one (walk-ins have no booking).
    appointmentId = appointment?.id;
  }

  if (!lockedVehicleId && params.vehicle) {
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("id")
      .eq("business_id", business.id)
      .eq("id", params.vehicle)
      .maybeSingle();
    if (!vehicle) notFound();
    lockedVehicleId = vehicle.id;
  }

  // When a vehicle is locked we only need that one row; otherwise offer the
  // business's vehicles to choose from.
  let query = supabase
    .from("vehicles")
    .select("id, customer_id, make, model, plate_number, customers(full_name)")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (lockedVehicleId) query = query.eq("id", lockedVehicleId);

  const { data: vehicleRows } = await query;

  const vehicles: VehicleOption[] = (vehicleRows ?? []).map((v) => {
    const customer = v.customers as unknown as { full_name: string } | null;
    return {
      id: v.id,
      customerId: v.customer_id,
      label: label(v),
      customerName: customer?.full_name ?? "",
    };
  });

  // A job whose quote pointed at a vehicle that no longer resolves must not
  // silently fall back to "any vehicle" -- the anchor would be wrong.
  if (lockedVehicleId && vehicles.length === 0) notFound();

  const templates = (await listInspectionTemplates(business.id)).map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    isDefault: tpl.is_default,
  }));

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="p-6">
        <StartInspectionForm
          vehicles={vehicles}
          templates={templates}
          jobId={jobId}
          appointmentId={appointmentId}
          lockedVehicleId={lockedVehicleId}
        />
      </div>
    </>
  );
}
