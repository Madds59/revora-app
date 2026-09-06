import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueMaintenanceReminderNotification } from "@/lib/notifications/service";

import { evaluateMaintenanceDueState, resolveCurrentMaintenancePlan } from "./due-state.js";
import { toIsoDate } from "./projection.js";

/**
 * The domain modules are plain ESM so the same functions run under
 * `node --test` without a build step, matching lib/ratings.js and
 * lib/validation/*.js. These declarations give the TypeScript callers a typed
 * surface over that boundary in one place, rather than casting at each call.
 */
type OdometerReadingInput = { mileage: number; quality: string; recorded_at: string };
type AppointmentInput = {
  confirmed_start: string | null;
  id: string;
  requested_start: string | null;
  status: string;
};
type MaintenancePlanInput = {
  created_at: string;
  id: string;
  next_service_date: string | null;
  next_service_mileage: number | null;
};
type DueState = {
  addressable: boolean;
  effectiveDueDate: string | null;
  projectionBasis: string;
  stage: "first" | "second" | null;
  status: string;
  suppressedBy: "appointment" | null;
};

const evaluateDueState = evaluateMaintenanceDueState as unknown as (input: {
  appointments: AppointmentInput[];
  now: Date;
  plan: MaintenancePlanInput;
  readings: OdometerReadingInput[];
  settings: MaintenanceSettingsRow;
}) => DueState;

const resolveCurrentPlan = resolveCurrentMaintenancePlan as unknown as (
  plans: MaintenancePlanInput[],
) => MaintenancePlanInput | null;

/**
 * The daily maintenance reminder scan.
 *
 * Trust boundary: this runs on a schedule with no user session, so it uses the
 * service-role client. That is deliberate and deliberately narrow -- it reads
 * only maintenance-relevant columns and writes nothing directly. Every customer
 * message goes out through queueCustomerNotification, which performs its own
 * verification (per-business channel settings, per-customer suppression,
 * payload allowlisting, dedupe). This is not a general privileged query surface.
 *
 * Correctness under duplicate execution rests on the dedupe unique index, not on
 * the scheduler behaving: two simultaneous scans race to insert the same
 * (business_id, dedupe_key) and one is ignored. Duplicate runs are wasteful,
 * never incorrect.
 */

export type ScanSummary = {
  businessesScanned: number;
  errors: number;
  notAddressable: number;
  plansEvaluated: number;
  remindersQueued: number;
  suppressedByAppointment: number;
  suppressedByPreference: number;
  vehiclesConsidered: number;
};

const DEFAULT_MAX_PLANS = 500;

function maxPlansPerRun(): number {
  const raw = Number(process.env.MAINTENANCE_SCAN_MAX_PLANS);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 5_000) : DEFAULT_MAX_PLANS;
}

function vehicleLabelFor(vehicle: {
  make: string | null;
  model: string | null;
  plate_number: string | null;
}): string {
  const name = [vehicle.make, vehicle.model].filter(Boolean).join(" ").trim();
  if (name && vehicle.plate_number) return `${name} (${vehicle.plate_number})`;
  return name || vehicle.plate_number || "your vehicle";
}

type MaintenanceSettingsRow = {
  assumed_annual_km: number | null;
  business_id: string;
  first_reminder_days: number;
  reminders_enabled: boolean;
  second_reminder_days: number;
};

async function scanBusiness(
  admin: SupabaseClient<Database>,
  settings: MaintenanceSettingsRow,
  now: Date,
  summary: ScanSummary,
  budget: { remaining: number },
) {
  // Only vehicles that actually have a plan are candidates, so the scan is
  // driven by plans rather than by every vehicle in the tenant.
  const { data: planRows, error: planError } = await admin
    .from("vehicle_maintenance_plans")
    .select("id, vehicle_id, next_service_date, next_service_mileage, created_at")
    .eq("business_id", settings.business_id)
    .order("created_at", { ascending: false })
    .limit(budget.remaining);

  if (planError) {
    summary.errors += 1;
    console.error("maintenance scan failed", "plan_query_error");
    return;
  }

  const plans = planRows ?? [];
  if (plans.length === 0) return;

  // Group by vehicle and keep only the current plan for each. A superseded plan
  // must not keep reminding.
  const byVehicle = new Map<string, typeof plans>();
  for (const plan of plans) {
    const list = byVehicle.get(plan.vehicle_id) ?? [];
    list.push(plan);
    byVehicle.set(plan.vehicle_id, list);
  }

  const vehicleIds = [...byVehicle.keys()];
  summary.vehiclesConsidered += vehicleIds.length;
  budget.remaining -= vehicleIds.length;

  // Batched lookups keyed by vehicle id -- never one query per vehicle.
  const [{ data: vehicleRows }, { data: readingRows }, { data: appointmentRows }] =
    await Promise.all([
      admin
        .from("vehicles")
        .select("id, customer_id, make, model, plate_number")
        .eq("business_id", settings.business_id)
        .in("id", vehicleIds),
      admin
        .from("vehicle_odometer_readings")
        .select("vehicle_id, mileage, recorded_at, quality")
        .eq("business_id", settings.business_id)
        .eq("quality", "valid")
        .in("vehicle_id", vehicleIds)
        .order("recorded_at", { ascending: false }),
      admin
        .from("appointments")
        .select("id, vehicle_id, status, confirmed_start, requested_start")
        .eq("business_id", settings.business_id)
        .in("vehicle_id", vehicleIds)
        .in("status", ["requested", "confirmed"]),
    ]);

  const vehicles = new Map((vehicleRows ?? []).map((v) => [v.id, v]));
  const readings = new Map<string, OdometerReadingInput[]>();
  for (const row of readingRows ?? []) {
    const list = readings.get(row.vehicle_id) ?? [];
    list.push(row);
    readings.set(row.vehicle_id, list);
  }
  const appointments = new Map<string, AppointmentInput[]>();
  for (const row of appointmentRows ?? []) {
    if (!row.vehicle_id) continue;
    const list = appointments.get(row.vehicle_id) ?? [];
    list.push(row as AppointmentInput);
    appointments.set(row.vehicle_id, list);
  }

  for (const vehicleId of vehicleIds) {
    // One malformed vehicle must never end the scan.
    try {
      const vehicle = vehicles.get(vehicleId);
      if (!vehicle?.customer_id) continue;

      const plan = resolveCurrentPlan((byVehicle.get(vehicleId) ?? []) as MaintenancePlanInput[]);
      if (!plan) continue;
      summary.plansEvaluated += 1;

      const state = evaluateDueState({
        appointments: (appointments.get(vehicleId) ?? []) as AppointmentInput[],
        now,
        plan,
        readings: readings.get(vehicleId) ?? [],
        settings,
      });

      if (!state.addressable) {
        summary.notAddressable += 1;
        continue;
      }
      if (state.suppressedBy === "appointment") {
        summary.suppressedByAppointment += 1;
        continue;
      }
      if (!state.stage) continue;

      const result = await enqueueMaintenanceReminderNotification({
        businessId: settings.business_id,
        customerId: vehicle.customer_id,
        dueDateLabel: state.effectiveDueDate ?? "",
        planId: plan.id,
        stage: state.stage,
        vehicleId,
        vehicleLabel: vehicleLabelFor(vehicle),
      });

      if (result.inserted > 0) summary.remindersQueued += result.inserted;
      else summary.suppressedByPreference += 1;
    } catch {
      summary.errors += 1;
      console.error("maintenance scan failed", "vehicle_evaluation_error");
    }
  }
}

export async function runMaintenanceReminderScan(now = new Date()): Promise<ScanSummary> {
  const summary: ScanSummary = {
    businessesScanned: 0,
    errors: 0,
    notAddressable: 0,
    plansEvaluated: 0,
    remindersQueued: 0,
    suppressedByAppointment: 0,
    suppressedByPreference: 0,
    vehiclesConsidered: 0,
  };

  const admin = createAdminClient();

  // Opt-in only. A tenant that has not enabled reminders is never scanned.
  const { data: settingsRows, error } = await admin
    .from("business_maintenance_settings")
    .select(
      "business_id, reminders_enabled, first_reminder_days, second_reminder_days, assumed_annual_km",
    )
    .eq("reminders_enabled", true);

  if (error) {
    summary.errors += 1;
    console.error("maintenance scan failed", "settings_query_error");
    return summary;
  }

  const budget = { remaining: maxPlansPerRun() };

  for (const settings of (settingsRows ?? []) as MaintenanceSettingsRow[]) {
    if (budget.remaining <= 0) break;
    summary.businessesScanned += 1;
    try {
      await scanBusiness(admin, settings, now, summary, budget);
    } catch {
      summary.errors += 1;
      console.error("maintenance scan failed", "business_scan_error");
    }
  }

  // Counts and stable codes only -- no customer names, plates, addresses or ids.
  console.info("maintenance scan complete", {
    ...summary,
    scannedFor: toIsoDate(now.toISOString()),
  });

  return summary;
}
