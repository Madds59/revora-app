// Turning a mileage threshold into a date.
//
// A calendar date is evaluable at any moment; a mileage threshold is not. The
// odometer is only read when the vehicle is physically present, which is
// exactly when a "come back soon" reminder would be pointless. So mileage is
// projected onto a date and the whole feature runs on one axis.
//
// The arithmetic is deliberately simple and explainable. It is an estimate, it
// is labelled as one everywhere it surfaces, and it refuses to answer rather
// than inventing precision the readings cannot support.

import {
  MAX_PLAUSIBLE_KM_PER_DAY,
  MAX_PROJECTION_DAYS,
  MILLIS_PER_DAY,
  MIN_RATE_INTERVAL_DAYS,
  MIN_RATE_INTERVAL_KM,
  RATE_WINDOW_SIZE,
  STALE_READING_DAYS,
} from "./constants.js";

const time = (iso) => new Date(iso).getTime();

/** Valid, non-stale readings, newest first, bounded to the rate window. */
export function usableReadings(readings, now) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return (readings ?? [])
    .filter((r) => r && r.quality === "valid")
    .filter((r) => Number.isFinite(time(r.recorded_at)))
    .filter((r) => (nowMs - time(r.recorded_at)) / MILLIS_PER_DAY <= STALE_READING_DAYS)
    .sort((a, b) => time(b.recorded_at) - time(a.recorded_at))
    .slice(0, RATE_WINDOW_SIZE);
}

/** The newest usable reading, or null. */
export function latestUsableReading(readings, now) {
  return usableReadings(readings, now)[0] ?? null;
}

/**
 * Observed km/day across the bounded window, or null when the sample cannot
 * support a rate.
 *
 * The span from oldest to newest reading in the window is used rather than the
 * single most recent interval, so one unusual trip does not dominate.
 */
export function deriveDrivingRate(readings, now) {
  const window = usableReadings(readings, now);
  if (window.length < 2) return null;

  const newest = window[0];
  const oldest = window[window.length - 1];

  const days = (time(newest.recorded_at) - time(oldest.recorded_at)) / MILLIS_PER_DAY;
  const delta = newest.mileage - oldest.mileage;

  if (days < MIN_RATE_INTERVAL_DAYS) return null;
  if (delta < MIN_RATE_INTERVAL_KM) return null;

  const rate = delta / days;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  if (rate > MAX_PLAUSIBLE_KM_PER_DAY) return null;

  return rate;
}

/**
 * Project the date a mileage threshold will be reached.
 *
 * Anchored on the reading's own `recorded_at`, not on today: `remaining` is
 * measured from that reading's mileage, so adding `remaining / rate` days to
 * the moment it was taken already accounts for everything driven since. That
 * is why this takes no `now`.
 *
 * @returns {{ dueDate: string|null, overdue: boolean, reason: string|null }}
 *   `dueDate` is an ISO date (YYYY-MM-DD).
 */
export function projectMileageDueDate({ latestReading, ratePerDay, nextServiceMileage }) {
  if (!latestReading || !Number.isFinite(nextServiceMileage)) {
    return { dueDate: null, overdue: false, reason: "no_reading" };
  }
  if (!Number.isFinite(ratePerDay) || ratePerDay <= 0) {
    return { dueDate: null, overdue: false, reason: "no_rate" };
  }

  const remaining = nextServiceMileage - latestReading.mileage;

  if (remaining <= 0) {
    // The threshold was already passed when we last looked at the car. The date
    // it was observed is the honest answer; the projection adds nothing.
    return {
      dueDate: toIsoDate(latestReading.recorded_at),
      overdue: true,
      reason: "threshold_passed",
    };
  }

  const days = remaining / ratePerDay;
  if (days > MAX_PROJECTION_DAYS) {
    return { dueDate: null, overdue: false, reason: "beyond_horizon" };
  }

  const due = new Date(time(latestReading.recorded_at) + days * MILLIS_PER_DAY);
  return { dueDate: toIsoDate(due.toISOString()), overdue: false, reason: null };
}

/** ISO date (YYYY-MM-DD) in Asia/Dubai, the app-wide policy timezone. */
export function toIsoDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  // en-CA renders as YYYY-MM-DD, and the timeZone option does the shifting, so
  // a "day" is a Dubai calendar day rather than a UTC one.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
