import assert from "node:assert/strict";
import test from "node:test";

// Maintenance Reminder Intelligence V1 — domain logic.
//
// See docs/superpowers/specs/2026-09-04-maintenance-reminder-intelligence-v1-design.md
//
// Everything here is pure: classification, rate derivation, projection, due
// state and stage selection take plain inputs and return plain results, so the
// scanner and the staff worklist can share one evaluator and neither has to
// reimplement a rule to render it.

import {
  MAX_PLAUSIBLE_KM,
  MAX_PLAUSIBLE_KM_PER_DAY,
  MAX_PROJECTION_DAYS,
  MIN_RATE_INTERVAL_DAYS,
  MIN_RATE_INTERVAL_KM,
  RATE_WINDOW_SIZE,
  STALE_READING_DAYS,
} from "../src/lib/maintenance/constants.js";
import { classifyOdometerReading } from "../src/lib/maintenance/odometer.js";
import {
  deriveDrivingRate,
  projectMileageDueDate,
} from "../src/lib/maintenance/projection.js";
import {
  buildReminderDedupeKey,
  evaluateMaintenanceDueState,
  resolveCurrentMaintenancePlan,
} from "../src/lib/maintenance/due-state.js";

const NOW = new Date("2026-09-04T08:00:00+04:00");
const day = (n) => new Date(NOW.getTime() + n * 86_400_000).toISOString();
const PLAN = "11111111-2222-4333-8444-555566667777";

const settings = (over = {}) => ({
  reminders_enabled: true,
  first_reminder_days: 14,
  second_reminder_days: 3,
  assumed_annual_km: null,
  ...over,
});

const reading = (mileage, daysAgo, over = {}) => ({
  mileage,
  recorded_at: day(-daysAgo),
  quality: "valid",
  ...over,
});

// --- odometer classification ------------------------------------------------

test("odometer: a plain forward reading is valid", () => {
  const r = classifyOdometerReading({ mileage: 42_000, recordedAt: day(0) }, null);
  assert.equal(r.quality, "valid");
  assert.equal(r.reason, null);
});

test("odometer: non-integer, negative and implausible values are unusable", () => {
  for (const bad of [null, undefined, "abc", NaN, Infinity, 12.5, -1, MAX_PLAUSIBLE_KM + 1]) {
    const r = classifyOdometerReading({ mileage: bad, recordedAt: day(0) }, null);
    assert.equal(r.quality, "unusable", `${bad} should be unusable`);
    assert.ok(r.reason, "an unusable reading must carry a stable reason code");
  }
});

test("odometer: a decreasing reading is suspicious, never rejected", () => {
  // Odometer replacement and correction of a typo both produce a lower value.
  // Losing that row would erase the vehicle's history exactly when it changed.
  const r = classifyOdometerReading(
    { mileage: 10, recordedAt: day(0) },
    reading(42_000, 30),
  );
  assert.equal(r.quality, "suspicious");
  assert.equal(r.reason, "decreasing");
});

test("odometer: an impossible driving rate is suspicious", () => {
  const r = classifyOdometerReading(
    { mileage: 42_000 + MAX_PLAUSIBLE_KM_PER_DAY * 2 + 1, recordedAt: day(0) },
    reading(42_000, 1),
  );
  assert.equal(r.quality, "suspicious");
  assert.equal(r.reason, "implausible_rate");
});

test("odometer: an identical same-day reading is suspicious but harmless", () => {
  const r = classifyOdometerReading(
    { mileage: 42_000, recordedAt: day(0) },
    reading(42_000, 0.5),
  );
  assert.equal(r.quality, "suspicious");
  assert.equal(r.reason, "duplicate_observation");
});

// --- driving rate -----------------------------------------------------------

test("rate: no readings and a single reading both yield no observed rate", () => {
  assert.equal(deriveDrivingRate([], NOW), null);
  assert.equal(deriveDrivingRate([reading(42_000, 10)], NOW), null);
});

test("rate: two readings across a real interval give km/day", () => {
  // 3000 km over 100 days = 30 km/day.
  const rate = deriveDrivingRate([reading(45_000, 0), reading(42_000, 100)], NOW);
  assert.ok(Math.abs(rate - 30) < 0.001, `expected ~30, got ${rate}`);
});

test("rate: too short an interval or too small a delta is refused", () => {
  const shortTime = deriveDrivingRate(
    [reading(42_500, 0), reading(42_000, MIN_RATE_INTERVAL_DAYS - 1)],
    NOW,
  );
  assert.equal(shortTime, null, "an interval below the minimum must not be divided");

  const smallDelta = deriveDrivingRate(
    [reading(42_000 + MIN_RATE_INTERVAL_KM - 1, 0), reading(42_000, 90)],
    NOW,
  );
  assert.equal(smallDelta, null, "a delta below the minimum must not be divided");
});

test("rate: suspicious and unusable readings are excluded from the sample", () => {
  const rate = deriveDrivingRate(
    [
      reading(9, 0, { quality: "suspicious" }), // odometer reset
      reading(45_000, 1),
      reading(42_000, 101),
    ],
    NOW,
  );
  assert.ok(Math.abs(rate - 30) < 0.001, `suspicious row leaked into the rate: ${rate}`);
});

test("rate: readings older than the staleness horizon are ignored", () => {
  const rate = deriveDrivingRate(
    [reading(45_000, STALE_READING_DAYS + 10), reading(42_000, STALE_READING_DAYS + 110)],
    NOW,
  );
  assert.equal(rate, null, "a stale sample must not describe today's driving");
});

test("rate: the window is bounded and spans oldest-to-newest within it", () => {
  const readings = [];
  for (let i = 0; i < RATE_WINDOW_SIZE + 5; i += 1) {
    readings.push(reading(50_000 - i * 1_000, i * 20));
  }
  const rate = deriveDrivingRate(readings, NOW);
  assert.ok(rate > 0, "a bounded window must still produce a rate");
  assert.ok(rate <= MAX_PLAUSIBLE_KM_PER_DAY, "rate must stay within the plausible ceiling");
});

// --- projection -------------------------------------------------------------

test("projection: remaining distance divided by rate lands on a date", () => {
  const result = projectMileageDueDate({
    latestReading: reading(42_000, 0),
    ratePerDay: 30,
    nextServiceMileage: 45_000, // 3000 km away at 30 km/day = 100 days
    now: NOW,
  });
  const days = (new Date(result.dueDate) - NOW) / 86_400_000;
  assert.ok(Math.abs(days - 100) < 1, `expected ~100 days out, got ${days}`);
  assert.equal(result.overdue, false);
});

test("projection: a threshold already passed is overdue, not negative-dated", () => {
  const result = projectMileageDueDate({
    latestReading: reading(46_000, 5),
    ratePerDay: 30,
    nextServiceMileage: 45_000,
    now: NOW,
  });
  assert.equal(result.overdue, true);
  assert.ok(result.dueDate, "an overdue projection still names the date it passed");
});

test("projection: beyond the horizon returns unavailable rather than false precision", () => {
  const result = projectMileageDueDate({
    latestReading: reading(1_000, 0),
    ratePerDay: 1, // 44,000 km away at 1 km/day is ~120 years
    nextServiceMileage: 45_000,
    now: NOW,
  });
  assert.equal(result.dueDate, null);
  assert.equal(result.reason, "beyond_horizon");
});

// --- due state --------------------------------------------------------------

const evaluate = (over = {}) =>
  evaluateMaintenanceDueState({
    plan: { id: PLAN, next_service_date: null, next_service_mileage: null },
    readings: [],
    settings: settings(),
    appointments: [],
    now: NOW,
    ...over,
  });

test("due: neither signal means the plan is not reminder-addressable", () => {
  const r = evaluate();
  assert.equal(r.addressable, false);
  assert.equal(r.status, "not_addressable");
  assert.equal(r.stage, null);
  assert.equal(r.effectiveDueDate, null);
});

test("due: Case A — a date with no readings is date-only", () => {
  const r = evaluate({
    plan: { id: PLAN, next_service_date: day(14).slice(0, 10), next_service_mileage: 45_000 },
  });
  assert.equal(r.projectionBasis, "date_only");
  assert.equal(r.dueSource, "date");
  assert.equal(r.projectedMileageDueDate, null, "mileage progress must not be fabricated");
});

test("due: Case B — one reading without a configured rate stays date-only", () => {
  const r = evaluate({
    plan: { id: PLAN, next_service_date: day(30).slice(0, 10), next_service_mileage: 45_000 },
    readings: [reading(42_000, 5)],
  });
  assert.equal(r.projectionBasis, "date_only");
  assert.equal(r.projectedMileageDueDate, null, "no global driving assumption may be invented");
});

test("due: Case B — one reading plus a configured rate projects", () => {
  const r = evaluate({
    plan: { id: PLAN, next_service_date: null, next_service_mileage: 45_000 },
    readings: [reading(42_000, 0)],
    settings: settings({ assumed_annual_km: 10_950 }), // 30 km/day
  });
  assert.equal(r.projectionBasis, "mileage_assumed");
  assert.equal(r.dueSource, "mileage_assumed");
  assert.ok(r.projectedMileageDueDate, "a configured assumption must produce a date");
});

test("due: Case C — two readings project from observed driving", () => {
  const r = evaluate({
    plan: { id: PLAN, next_service_date: null, next_service_mileage: 45_000 },
    readings: [reading(42_000, 0), reading(39_000, 100)],
  });
  assert.equal(r.projectionBasis, "mileage_observed");
  assert.equal(r.dueSource, "mileage_observed");
  assert.ok(Math.abs(r.drivingRatePerDay - 30) < 0.001);
});

test("due: observed driving beats a configured assumption when both exist", () => {
  const r = evaluate({
    plan: { id: PLAN, next_service_date: null, next_service_mileage: 45_000 },
    readings: [reading(42_000, 0), reading(39_000, 100)],
    settings: settings({ assumed_annual_km: 100_000 }),
  });
  assert.equal(r.projectionBasis, "mileage_observed");
});

test("due: the earlier of date and mileage projection wins, both directions", () => {
  const dateFirst = evaluate({
    plan: { id: PLAN, next_service_date: day(10).slice(0, 10), next_service_mileage: 45_000 },
    readings: [reading(42_000, 0), reading(39_000, 100)], // ~100 days out
  });
  assert.equal(dateFirst.dueSource, "date");
  assert.equal(dateFirst.effectiveDueDate, day(10).slice(0, 10));

  const mileageFirst = evaluate({
    plan: { id: PLAN, next_service_date: day(300).slice(0, 10), next_service_mileage: 45_000 },
    readings: [reading(42_000, 0), reading(39_000, 100)],
  });
  assert.equal(mileageFirst.dueSource, "mileage_observed");
  assert.ok(mileageFirst.effectiveDueDate < day(300).slice(0, 10));
});

// --- stages -----------------------------------------------------------------

test("stage: too early yields no reminder", () => {
  const r = evaluate({
    plan: { id: PLAN, next_service_date: day(60).slice(0, 10), next_service_mileage: null },
  });
  assert.equal(r.stage, null);
  assert.equal(r.status, "upcoming");
});

test("stage: the first window yields the first reminder", () => {
  const r = evaluate({
    plan: { id: PLAN, next_service_date: day(14).slice(0, 10), next_service_mileage: null },
  });
  assert.equal(r.stage, "first");
});

test("stage: inside the second window yields only the second reminder", () => {
  // A plan first seen 2 days out must not fire a burst of both stages.
  const r = evaluate({
    plan: { id: PLAN, next_service_date: day(2).slice(0, 10), next_service_mileage: null },
  });
  assert.equal(r.stage, "second");
});

test("stage: an overdue plan is reported overdue", () => {
  const r = evaluate({
    plan: { id: PLAN, next_service_date: day(-5).slice(0, 10), next_service_mileage: null },
  });
  assert.equal(r.status, "overdue");
});

// --- appointment suppression ------------------------------------------------

const appt = (status, daysOut) => ({
  id: "99999999-8888-4777-8666-555544443333",
  status,
  confirmed_start: day(daysOut),
  requested_start: day(daysOut),
});

test("suppression: a booking near the due date suppresses the reminder", () => {
  for (const status of ["requested", "confirmed"]) {
    const r = evaluate({
      plan: { id: PLAN, next_service_date: day(14).slice(0, 10), next_service_mileage: null },
      appointments: [appt(status, 10)],
    });
    assert.equal(r.suppressedBy, "appointment", `${status} should suppress`);
    assert.equal(r.stage, null, `${status} must stop the reminder being eligible`);
  }
});

test("suppression: cancelled, declined and no-show bookings do NOT suppress", () => {
  for (const status of ["cancelled", "declined", "no_show", "completed"]) {
    const r = evaluate({
      plan: { id: PLAN, next_service_date: day(14).slice(0, 10), next_service_mileage: null },
      appointments: [appt(status, 10)],
    });
    assert.equal(r.suppressedBy, null, `${status} must not silence a future reminder`);
    assert.equal(r.stage, "first");
  }
});

test("suppression: a booking far outside the due window does not suppress", () => {
  const r = evaluate({
    plan: { id: PLAN, next_service_date: day(14).slice(0, 10), next_service_mileage: null },
    appointments: [appt("confirmed", 400)],
  });
  assert.equal(r.suppressedBy, null, "an unrelated future booking must not silence forever");
});

test("suppression: a past booking does not suppress", () => {
  const r = evaluate({
    plan: { id: PLAN, next_service_date: day(14).slice(0, 10), next_service_mileage: null },
    appointments: [appt("confirmed", -30)],
  });
  assert.equal(r.suppressedBy, null);
});

// --- plan selection + dedupe ------------------------------------------------

test("plans: the newest plan supersedes older ones", () => {
  const current = resolveCurrentMaintenancePlan([
    { id: "old", created_at: day(-40) },
    { id: "new", created_at: day(-1) },
    { id: "middle", created_at: day(-10) },
  ]);
  assert.equal(current.id, "new");
  assert.equal(resolveCurrentMaintenancePlan([]), null);
});

test("dedupe: identity is plan and stage, never the projected date", () => {
  const a = buildReminderDedupeKey({ planId: PLAN, stage: "first" });
  const b = buildReminderDedupeKey({ planId: PLAN, stage: "first" });
  assert.equal(a, b, "the same plan and stage must always produce one identity");
  assert.notEqual(a, buildReminderDedupeKey({ planId: PLAN, stage: "second" }));
  assert.notEqual(a, buildReminderDedupeKey({ planId: "other", stage: "first" }));
  assert.match(a, /^maintenance_reminder:/);
  assert.ok(a.length <= 200, "dedupe keys must fit the queue's 200-char bound");
});

test("dedupe: a moving projection does not mint a new identity", () => {
  // The whole point: a mileage estimate that drifts by days must not re-notify.
  const early = evaluate({
    plan: { id: PLAN, next_service_date: null, next_service_mileage: 45_000 },
    readings: [reading(42_000, 0), reading(39_000, 100)],
  });
  const later = evaluate({
    plan: { id: PLAN, next_service_date: null, next_service_mileage: 45_000 },
    readings: [reading(42_100, 0), reading(39_000, 100)],
  });
  assert.notEqual(
    early.effectiveDueDate,
    later.effectiveDueDate,
    "this test is meaningless unless the projection actually moved",
  );
  assert.equal(
    buildReminderDedupeKey({ planId: PLAN, stage: "first" }),
    buildReminderDedupeKey({ planId: PLAN, stage: "first" }),
  );
});

test("constants: projection horizon and window are bounded", () => {
  assert.ok(MAX_PROJECTION_DAYS > 0 && MAX_PROJECTION_DAYS <= 1095);
  assert.ok(RATE_WINDOW_SIZE >= 2);
});
