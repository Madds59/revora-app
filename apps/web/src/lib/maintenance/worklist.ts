import "server-only";

import { createClient } from "@/lib/supabase/server";

import {
  evaluateMaintenanceDueState as evaluateMaintenanceDueStateJs,
  resolveCurrentMaintenancePlan as resolveCurrentMaintenancePlanJs,
} from "./due-state.js";

// The domain modules are plain ESM so they run under `node --test` without a
// build step. These give the TypeScript caller a typed surface in one place.
type DueStateResult = {
  addressable: boolean;
  dueSource: string | null;
  effectiveDueDate: string | null;
  latestReading: { mileage: number } | null;
  projectionBasis: string;
  status: string;
  suppressedBy: string | null;
};

const evaluateMaintenanceDueState = evaluateMaintenanceDueStateJs as unknown as (input: {
  appointments: Array<Record<string, unknown>>;
  now: Date;
  plan: Record<string, unknown>;
  readings: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
}) => DueStateResult;

const resolveCurrentMaintenancePlan = resolveCurrentMaintenancePlanJs as unknown as (
  plans: Array<Record<string, unknown>>,
) => Record<string, unknown> | null;

/**
 * Data for the staff maintenance worklist.
 *
 * Deliberately built on the SAME evaluator the scanner uses. A page that
 * computed due-ness its own way would eventually disagree with the reminder the
 * customer actually received, and staff would be reading one truth while the
 * customer was told another.
 *
 * Unlike the scanner this runs on the caller's own session client, so RLS is
 * the enforcement layer and only the caller's business is ever visible.
 */

export type WorklistRow = {
  appointmentStatus: string | null;
  customerName: string;
  effectiveDueDate: string | null;
  dueSource: string | null;
  latestMileage: number | null;
  nextServiceDate: string | null;
  nextServiceMileage: number | null;
  projectionBasis: string;
  status: string;
  suppressed: boolean;
  vehicleId: string;
  vehicleLabel: string;
};

type PlanRow = {
  created_at: string;
  id: string;
  next_service_date: string | null;
  next_service_mileage: number | null;
  vehicle_id: string;
};

const WORKLIST_LIMIT = 200;

function vehicleLabelFor(v: {
  make: string | null;
  model: string | null;
  plate_number: string | null;
}) {
  const name = [v.make, v.model].filter(Boolean).join(" ").trim();
  if (name && v.plate_number) return `${name} · ${v.plate_number}`;
  return name || v.plate_number || "—";
}

export async function loadMaintenanceWorklist(
  businessId: string,
  now = new Date(),
): Promise<WorklistRow[]> {
  const supabase = await createClient();

  const [{ data: planRows }, { data: settingsRow }] = await Promise.all([
    supabase
      .from("vehicle_maintenance_plans")
      .select("id, vehicle_id, next_service_date, next_service_mileage, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(WORKLIST_LIMIT * 3),
    supabase
      .from("business_maintenance_settings")
      .select(
        "business_id, reminders_enabled, first_reminder_days, second_reminder_days, assumed_annual_km",
      )
      .eq("business_id", businessId)
      .maybeSingle(),
  ]);

  const plans = (planRows ?? []) as PlanRow[];
  if (plans.length === 0) return [];

  const byVehicle = new Map<string, PlanRow[]>();
  for (const plan of plans) {
    const list = byVehicle.get(plan.vehicle_id) ?? [];
    list.push(plan);
    byVehicle.set(plan.vehicle_id, list);
  }
  const vehicleIds = [...byVehicle.keys()];

  const [{ data: vehicleRows }, { data: readingRows }, { data: appointmentRows }] =
    await Promise.all([
      supabase
        .from("vehicles")
        .select("id, customer_id, make, model, plate_number, customer:customers(full_name)")
        .eq("business_id", businessId)
        .in("id", vehicleIds),
      supabase
        .from("vehicle_odometer_readings")
        .select("vehicle_id, mileage, recorded_at, quality")
        .eq("business_id", businessId)
        .eq("quality", "valid")
        .in("vehicle_id", vehicleIds)
        .order("recorded_at", { ascending: false }),
      supabase
        .from("appointments")
        .select("id, vehicle_id, status, confirmed_start, requested_start")
        .eq("business_id", businessId)
        .in("vehicle_id", vehicleIds)
        .in("status", ["requested", "confirmed"]),
    ]);

  const vehicles = new Map(
    (vehicleRows ?? []).map((v) => [
      v.id,
      v as unknown as {
        customer: { full_name: string } | null;
        id: string;
        make: string | null;
        model: string | null;
        plate_number: string | null;
      },
    ]),
  );

  const readings = new Map<string, Array<Record<string, unknown>>>();
  for (const row of readingRows ?? []) {
    const list = readings.get(row.vehicle_id) ?? [];
    list.push(row);
    readings.set(row.vehicle_id, list);
  }

  const appointments = new Map<string, Array<Record<string, unknown>>>();
  for (const row of appointmentRows ?? []) {
    if (!row.vehicle_id) continue;
    const list = appointments.get(row.vehicle_id) ?? [];
    list.push(row);
    appointments.set(row.vehicle_id, list);
  }

  const settings = settingsRow ?? {
    assumed_annual_km: null,
    first_reminder_days: 14,
    reminders_enabled: false,
    second_reminder_days: 3,
  };

  const rows: WorklistRow[] = [];
  for (const vehicleId of vehicleIds) {
    const vehicle = vehicles.get(vehicleId);
    if (!vehicle) continue;
    const plan = resolveCurrentMaintenancePlan(
      (byVehicle.get(vehicleId) ?? []) as unknown as Array<Record<string, unknown>>,
    ) as unknown as PlanRow | null;
    if (!plan) continue;

    const vehicleAppointments = appointments.get(vehicleId) ?? [];
    const state = evaluateMaintenanceDueState({
      appointments: vehicleAppointments,
      now,
      plan,
      readings: readings.get(vehicleId) ?? [],
      settings,
    });

    if (!state.addressable) continue;

    rows.push({
      appointmentStatus:
        (vehicleAppointments[0]?.status as string | undefined) ?? null,
      customerName: vehicle.customer?.full_name ?? "—",
      dueSource: state.dueSource,
      effectiveDueDate: state.effectiveDueDate,
      latestMileage: state.latestReading?.mileage ?? null,
      nextServiceDate: plan.next_service_date,
      nextServiceMileage: plan.next_service_mileage,
      projectionBasis: state.projectionBasis,
      status: state.status,
      suppressed: state.suppressedBy === "appointment",
      vehicleId,
      vehicleLabel: vehicleLabelFor(vehicle),
    });
  }

  // Soonest first; overdue naturally sorts to the top.
  rows.sort((a, b) => (a.effectiveDueDate ?? "").localeCompare(b.effectiveDueDate ?? ""));
  return rows.slice(0, WORKLIST_LIMIT);
}
