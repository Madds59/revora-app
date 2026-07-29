// Shared server-side input-validation primitives (APPSEC-09 Phase 1).
//
// Authored as .js (ESM) so the same schemas run in Server Actions (imported by
// the .ts action files) AND in the offline `node --test tests/*.test.mjs` suite,
// matching the existing convention (lib/ratings.js, lib/vehicle-intelligence/
// schemas.js). Every user-facing message here is curated and safe — raw Zod
// issue objects, schema internals, and DB/SDK errors are never surfaced.
//
// Rules are evidence-based: enum allowlists come from the Postgres enums, numeric
// bounds from the `numeric(12,2)` / `numeric(5,2)` column precision, and string
// caps follow the project's existing precedent (ratings review .max(1000)) as
// anti-abuse guards generous enough not to reject legitimate English/Arabic text.

import { z } from "zod";

// UUID via regex (version-independent, no dependence on a specific Zod string-format
// message API) with a curated, user-safe message.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Blank ("" or missing) -> undefined, so optional fields don't fail as "".  */
const blankToUndefined = (v) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "")
    ? undefined
    : v;

/** Required UUID (rejects blank / malformed). */
export const uuid = (label = "reference") =>
  z.string().trim().regex(UUID_RE, `Please select a valid ${label}.`);

/** Optional UUID: absent/blank is allowed; if present it must be a valid UUID. */
export const optionalUuid = (label = "reference") =>
  z.preprocess(blankToUndefined, uuid(label).optional());

/** Required, trimmed, non-empty text with a generous anti-abuse cap. */
export const requiredText = (label = "This field", max = 2000) =>
  z
    .string({ message: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} is too long.`);

/** Optional, trimmed text; blank -> undefined; generous cap. */
export const optionalText = (max = 5000) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

/**
 * A number field parsed from FormData. Blank/missing falls back to `def`
 * (preserving existing default behavior); non-blank garbage (NaN, Infinity,
 * non-numeric) is rejected rather than silently defaulted.
 */
export const numberField = ({
  label = "value",
  def = 0,
  min = 0,
  max = 9_999_999.99,
  integer = false,
} = {}) =>
  z.preprocess((v) => {
    const cleaned = blankToUndefined(v);
    if (cleaned === undefined) return def;
    return Number(String(cleaned).trim());
  }, z
    // Curated message so a NaN/non-number never surfaces Zod's raw base message.
    .number({ message: `Please enter a valid ${label}.` })
    .refine((n) => Number.isFinite(n), `Please enter a valid ${label}.`)
    .refine((n) => !integer || Number.isInteger(n), `${label} must be a whole number.`)
    .refine((n) => n >= min, `${label} cannot be less than ${min}.`)
    .refine((n) => n <= max, `${label} is too large.`));

/** Money/decimal value fitting numeric(12,2); non-negative by default. */
export const money = (label = "amount") =>
  numberField({ label, def: 0, min: 0, max: 9_999_999.99 });

/** Quantity fitting numeric(12,2); non-negative; default 1 when blank. */
export const quantity = numberField({
  label: "quantity",
  def: 1,
  min: 0,
  max: 9_999_999.99,
});

/** Percentage rate (e.g. tax) fitting numeric(5,2); 0–100 domain. */
export const percentRate = (label = "rate") =>
  numberField({ label, def: 0, min: 0, max: 100 });

/** Strict enum allowlist with a curated message. */
export const enumOf = (values, label = "value") =>
  z.preprocess(
    blankToUndefined,
    z.any().refine(
      (v) => typeof v === "string" && values.includes(v),
      `Please choose a valid ${label}.`,
    ),
  );

/** Optional enum: blank -> undefined; if present must be in the allowlist. */
export const optionalEnumOf = (values, label = "value") =>
  z.preprocess(
    blankToUndefined,
    z
      .any()
      .refine(
        (v) => v === undefined || (typeof v === "string" && values.includes(v)),
        `Please choose a valid ${label}.`,
      )
      .optional(),
  );

/**
 * Optional date string. Validates parseability and rejects impossible dates,
 * but passes the trimmed original string through unchanged (no reformatting) so
 * existing timezone/storage behavior is preserved.
 */
export const optionalDateString = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(v)), "Please enter a valid date.")
    .optional(),
);

/**
 * Extract a single user-safe validation message from a failed safeParse result.
 * Only the curated message string is returned — never the Zod issue object,
 * paths, or schema internals. A length guard prevents any unexpected non-curated
 * text from leaking; otherwise a generic fallback is used.
 */
export function firstValidationMessage(
  parsed,
  fallback = "Please review the information you entered and try again.",
) {
  const message = parsed?.error?.issues?.[0]?.message;
  if (typeof message === "string" && message.length > 0 && message.length <= 160) {
    return message;
  }
  return fallback;
}
