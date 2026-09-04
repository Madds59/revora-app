// The single authority on "is this vehicle due, and should we say anything?"
//
// The daily scanner and the staff worklist both call evaluateMaintenanceDueState.
// Nothing downstream re-derives a rule: a page that computed due-ness its own
// way would eventually disagree with the reminder the customer received.

import {
  APPOINTMENT_SUPPRESSION_GRACE_DAYS,
  MILLIS_PER_DAY,
  SUPPRESSING_APPOINTMENT_STATUSES,
} from "./constants.js";
import {
  deriveDrivingRate,
  latestUsableReading,
  projectMileageDueDate,
  toIsoDate,
} from "./projection.js";

/**
 * vehicle_maintenance_plans is append-only; the applicable plan is the newest
 * row, matching the latest_plan_id semantics already used by the vehicle
 * intelligence detail RPC. Because reminder identity is plan-scoped, a
 * superseded plan stops reminding the moment a newer one exists.
 */
export function resolveCurrentMaintenancePlan(plans) {
  const rows = (plans ?? []).filter((p) => p && p.created_at);
  if (rows.length === 0) return null;
  return rows.reduce((newest, row) =>
    new Date(row.created_at).getTime() > new Date(newest.created_at).getTime() ? row : newest,
  );
}

/**
 * Reminder identity: the plan and the stage, never the projected date.
 *
 * A mileage estimate legitimately moves as new readings arrive. Keying on the
 * date would mint a fresh identity every time it drifted and re-notify the
 * customer; keying on the plan means a stage is sent exactly once.
 */
export function buildReminderDedupeKey({ planId, stage }) {
  return `maintenance_reminder:${planId}:${stage}`;
}

function daysBetween(fromIso, toIso) {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / MILLIS_PER_DAY;
}

/** The earliest of the available signals; nulls never win. */
function earliest(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return a <= b ? a : b;
}

function findSuppressingAppointment(appointments, effectiveDueDate, now) {
  if (!effectiveDueDate) return null;
  const nowMs = now.getTime();
  const horizonMs =
    new Date(`${effectiveDueDate}T23:59:59+04:00`).getTime() +
    APPOINTMENT_SUPPRESSION_GRACE_DAYS * MILLIS_PER_DAY;

  return (
    (appointments ?? []).find((a) => {
      if (!a || !SUPPRESSING_APPOINTMENT_STATUSES.includes(a.status)) return false;
      const startIso = a.confirmed_start ?? a.requested_start;
      if (!startIso) return false;
      const startMs = new Date(startIso).getTime();
      if (!Number.isFinite(startMs)) return false;
      // Only a booking between now and shortly after the due date counts. A
      // past visit, or one a year out, is not this service.
      return startMs >= nowMs && startMs <= horizonMs;
    }) ?? null
  );
}

/**
 * Evaluate one vehicle's current maintenance plan.
 *
 * Pure: every input is passed in, nothing is fetched, so the scanner and the
 * staff page share behaviour and the whole matrix is unit-testable.
 */
export function evaluateMaintenanceDueState({
  plan,
  readings = [],
  settings,
  appointments = [],
  now,
}) {
  const at = now instanceof Date ? now : new Date(now);
  const nowIso = toIsoDate(at.toISOString());

  const base = {
    addressable: false,
    effectiveDueDate: null,
    calendarDueDate: null,
    projectedMileageDueDate: null,
    dueSource: null,
    nextServiceMileage: null,
    latestReading: null,
    drivingRatePerDay: null,
    projectionBasis: "unavailable",
    status: "not_addressable",
    stage: null,
    suppressedBy: null,
    suppressingAppointmentId: null,
  };

  if (!plan) return base;

  const calendarDueDate = plan.next_service_date ? toIsoDate(`${plan.next_service_date}T12:00:00+04:00`) : null;
  const nextServiceMileage = Number.isFinite(plan.next_service_mileage)
    ? plan.next_service_mileage
    : null;

  const latest = latestUsableReading(readings, at);
  const observedRate = deriveDrivingRate(readings, at);

  // Case B: one reading gives position but not rate. Project only from a rate
  // the business explicitly configured -- never a global invented assumption.
  const assumedAnnualKm = Number.isFinite(settings?.assumed_annual_km)
    ? settings.assumed_annual_km
    : null;
  const assumedRate = assumedAnnualKm ? assumedAnnualKm / 365 : null;

  const rate = observedRate ?? assumedRate;
  const rateBasis = observedRate ? "mileage_observed" : assumedRate ? "mileage_assumed" : null;

  let projectedMileageDueDate = null;
  let mileageOverdue = false;
  if (latest && nextServiceMileage !== null && rate) {
    const projection = projectMileageDueDate({
      latestReading: latest,
      ratePerDay: rate,
      nextServiceMileage,
      now: at,
    });
    projectedMileageDueDate = projection.dueDate;
    mileageOverdue = projection.overdue;
  }

  const effectiveDueDate = earliest(calendarDueDate, projectedMileageDueDate);

  if (!effectiveDueDate) {
    return {
      ...base,
      calendarDueDate,
      nextServiceMileage,
      latestReading: latest,
      drivingRatePerDay: rate ?? null,
    };
  }

  const dueSource =
    projectedMileageDueDate && projectedMileageDueDate === effectiveDueDate
      ? rateBasis
      : "date";
  const projectionBasis = projectedMileageDueDate ? rateBasis : "date_only";

  const daysUntilDue = daysBetween(nowIso, effectiveDueDate);
  const firstDays = settings?.first_reminder_days ?? 14;
  const secondDays = settings?.second_reminder_days ?? 3;

  let status;
  if (daysUntilDue < 0 || mileageOverdue) status = "overdue";
  else if (daysUntilDue <= firstDays) status = "due_soon";
  else status = "upcoming";

  // Stage windows are exclusive so a plan first seen two days out gets the
  // second reminder only, not a burst of both.
  let stage = null;
  if (daysUntilDue >= 0) {
    if (daysUntilDue <= secondDays) stage = "second";
    else if (daysUntilDue <= firstDays) stage = "first";
  }

  const suppressing = findSuppressingAppointment(appointments, effectiveDueDate, at);

  return {
    addressable: true,
    effectiveDueDate,
    calendarDueDate,
    projectedMileageDueDate,
    dueSource,
    nextServiceMileage,
    latestReading: latest,
    drivingRatePerDay: rate ?? null,
    projectionBasis,
    status,
    stage: suppressing ? null : stage,
    suppressedBy: suppressing ? "appointment" : null,
    suppressingAppointmentId: suppressing?.id ?? null,
  };
}
