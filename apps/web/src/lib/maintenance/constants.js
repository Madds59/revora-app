// Maintenance Reminder Intelligence V1 — thresholds.
//
// Every bound the projection engine relies on lives here rather than as a
// literal buried in a branch, so the policy is reviewable in one place and the
// tests can assert against the same values the runtime uses.

/** Above this a reading is not a car odometer, it is a typo or a unit mixup. */
export const MAX_PLAUSIBLE_KM = 3_000_000;

/**
 * ~1000 km in a day is a long haul but possible; sustained more than that
 * across an interval means the pair of readings cannot both be right.
 */
export const MAX_PLAUSIBLE_KM_PER_DAY = 1_000;

/** Readings older than this describe a real past observation, not today's car. */
export const STALE_READING_DAYS = 365;

/** How many recent valid readings the rate window may consider. */
export const RATE_WINDOW_SIZE = 5;

/** Below this elapsed time the sample is too small to divide safely. */
export const MIN_RATE_INTERVAL_DAYS = 14;

/** Below this distance the delta is noise rather than driving. */
export const MIN_RATE_INTERVAL_KM = 100;

/**
 * A projection further out than this is arithmetic, not information. Past it
 * the engine returns "unavailable" rather than a date nobody should trust.
 */
export const MAX_PROJECTION_DAYS = 730;

/**
 * How far past the effective due date a booking may sit and still count as
 * "they have already booked for this service".
 */
export const APPOINTMENT_SUPPRESSION_GRACE_DAYS = 14;

/** Appointment statuses that mean the customer is already engaging. */
export const SUPPRESSING_APPOINTMENT_STATUSES = ["requested", "confirmed"];

export const MILLIS_PER_DAY = 86_400_000;
