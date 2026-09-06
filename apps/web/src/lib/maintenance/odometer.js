// Odometer reading classification.
//
// A reading is not trustworthy merely because the column accepted an integer.
// Each reading is judged against the newest prior VALID reading for the same
// vehicle, and the verdict is stored so history keeps the judgement that was
// made against the data available at the time.
//
// Deliberately NOT a database constraint: an odometer replacement and the
// correction of a mistyped reading both produce a legitimately lower value.
// Rejecting those would discard the vehicle's history at exactly the moment it
// changed, so a lower reading is recorded and marked `suspicious` instead. The
// projection engine then refuses to treat it as reliable input.

import {
  MAX_PLAUSIBLE_KM,
  MAX_PLAUSIBLE_KM_PER_DAY,
  MILLIS_PER_DAY,
} from "./constants.js";

function isUsableInteger(value) {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

function elapsedDays(laterIso, earlierIso) {
  const later = new Date(laterIso).getTime();
  const earlier = new Date(earlierIso).getTime();
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return null;
  return (later - earlier) / MILLIS_PER_DAY;
}

/**
 * Classify one candidate reading.
 *
 * @param candidate {{ mileage: unknown, recordedAt: string }}
 * @param previousValid the newest prior VALID reading, or null when this is the
 *   vehicle's first. Shape: { mileage, recorded_at }.
 * @returns {{ quality: 'valid'|'suspicious'|'unusable', reason: string|null }}
 */
export function classifyOdometerReading(candidate, previousValid) {
  const mileage = candidate?.mileage;

  if (!isUsableInteger(mileage)) return { quality: "unusable", reason: "not_an_integer" };
  if (mileage < 0) return { quality: "unusable", reason: "negative" };
  if (mileage > MAX_PLAUSIBLE_KM) return { quality: "unusable", reason: "implausible_value" };

  if (!previousValid) return { quality: "valid", reason: null };

  if (mileage < previousValid.mileage) {
    // Legitimate after an odometer replacement or a corrected entry, but not
    // something a rate may be derived from.
    return { quality: "suspicious", reason: "decreasing" };
  }

  const days = elapsedDays(candidate.recordedAt, previousValid.recorded_at);
  if (days === null) return { quality: "suspicious", reason: "undatable" };

  const delta = mileage - previousValid.mileage;

  if (delta === 0 && days < 1) {
    // Re-submitting the same number an hour later adds no information.
    return { quality: "suspicious", reason: "duplicate_observation" };
  }

  if (days > 0 && delta / days > MAX_PLAUSIBLE_KM_PER_DAY) {
    return { quality: "suspicious", reason: "implausible_rate" };
  }

  return { quality: "valid", reason: null };
}
