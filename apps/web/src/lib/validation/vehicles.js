// Vehicle server-action input schemas (APPSEC-09 Phase 3).
//
// Deliberate boundaries:
//   * No specification enrichment. These schemas validate STRUCTURE only —
//     make/model/color/plate stay free text exactly as the `vehicles` table and
//     the vehicle form allow today. Nothing is inferred, decoded, or filled in.
//   * VIN is NOT format-checked. The `vehicles.vin` column is plain `text`, the
//     form accepts free text, and no existing rule establishes a format for
//     stored vehicles, so only a generous length cap is applied. (The separate
//     `lib/vehicle-intelligence/vin.js` validator belongs to the VIN-decode
//     feature and is intentionally not imposed here — doing so would reject
//     vehicles that are storable today.)
//   * The year range mirrors the action's pre-existing `parseYear` rule
//     (1900 .. current year + 1) rather than inventing a new one.
//
// business_id is never part of these schemas; it comes from the session.

import { z } from "zod";
import { optionalText, optionalUuid, uuid } from "./common.js";

/** Lower bound of the pre-existing parseYear() rule in vehicles/actions.ts. */
export const MIN_VEHICLE_YEAR = 1900;

/** Upper bound follows the same rule: next model year is allowed. */
export const maxVehicleYear = () => new Date().getFullYear() + 1;

/**
 * Optional model year. Blank -> undefined (the actions persist null, preserving
 * "clearing the field" behavior). Non-blank must be a whole number inside the
 * existing supported range; NaN/Infinity/decimals are rejected rather than
 * silently coerced.
 */
export const vehicleYear = z.preprocess(
  (v) => {
    if (v === undefined || v === null || String(v).trim() === "") return undefined;
    return Number(String(v).trim());
  },
  z
    .number({ message: "Year must be a valid year." })
    .refine((n) => Number.isInteger(n), "Year must be a valid year.")
    .refine(
      (n) => n >= MIN_VEHICLE_YEAR && n <= maxVehicleYear(),
      "Year must be a valid year.",
    )
    .optional(),
);

const vehicleFields = {
  make: optionalText(120),
  model: optionalText(120),
  plateNumber: optionalText(32),
  vin: optionalText(64),
  color: optionalText(60),
  year: vehicleYear,
};

/** createVehicle: customer selector required (ownership re-checked server-side). */
export const createVehicleSchema = z.object({
  customerId: uuid("customer"),
  ...vehicleFields,
});

/**
 * updateVehicle: vehicle id required; the customer selector is optional because
 * the action falls back to the vehicle's current customer when it is absent.
 * Both ids are only selectors — ownership is verified against the session's
 * business before any mutation.
 */
export const updateVehicleSchema = z.object({
  id: uuid("vehicle"),
  customerId: optionalUuid("customer"),
  ...vehicleFields,
});
