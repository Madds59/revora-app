// Digital vehicle inspection server-action input schemas (DVI V1).
//
// Authored as .js (ESM) to match lib/validation/invoices.js and appointments.js
// so the same schemas run in Server Actions and in the offline node test suite.
// Enum allowlists mirror the Postgres inspection_context / inspection_result
// enums created in 0037 -- they are duplicated here deliberately so a malformed
// value is rejected with a curated message before it ever reaches the database.

import { z } from "zod";
import {
  enumOf,
  numberField,
  optionalText,
  optionalUuid,
  uuid,
} from "./common.js";

/** Postgres `inspection_context`. */
export const INSPECTION_CONTEXTS = ["pre_quote", "in_job"];

/**
 * Postgres `inspection_result`, in the order they are presented to staff.
 * `not_checked` is a real outcome, never a synonym for `pass` -- it is listed
 * last so the editor never implies it is the "safe" default choice.
 */
export const INSPECTION_RESULTS = ["pass", "attention", "fail", "not_checked"];

/** Results that may be turned into quotation lines (spec section 11). */
export const QUOTABLE_RESULTS = ["attention", "fail"];

/** Share-link lifetime bounds, in days. 30 is the spec default. */
export const SHARE_EXPIRY_DEFAULT_DAYS = 30;
export const SHARE_EXPIRY_MIN_DAYS = 1;
export const SHARE_EXPIRY_MAX_DAYS = 365;

/**
 * startInspection. `jobId` / `appointmentId` are optional here because the
 * database is the authority on the context/anchor rule (the
 * vehicle_inspections_context_anchor CHECK plus enforce_inspection_integrity).
 * We still reject the obviously-wrong combination up front so staff get a
 * readable message instead of a constraint violation.
 */
export const startInspectionSchema = z
  .object({
    customerId: uuid("customer"),
    vehicleId: uuid("vehicle"),
    context: enumOf(INSPECTION_CONTEXTS, "inspection type"),
    templateId: optionalUuid("checklist"),
    appointmentId: optionalUuid("appointment"),
    jobId: optionalUuid("job"),
    // Odometer is optional; 0 is meaningful (a brand-new vehicle), so the
    // blank-to-undefined handling lives in the action, not a numeric default.
    odometer: z.preprocess(
      (v) =>
        v === undefined || v === null || String(v).trim() === ""
          ? undefined
          : v,
      numberField({
        label: "odometer reading",
        def: 0,
        min: 0,
        max: 9_999_999,
        integer: true,
      }).optional(),
    ),
  })
  .refine((v) => v.context !== "in_job" || !!v.jobId, {
    message: "An in-job inspection must be started from a job.",
  })
  .refine((v) => v.context !== "pre_quote" || !v.jobId, {
    message: "A pre-quote inspection cannot be attached to a job.",
  });

/**
 * updateInspectionItem: one card's whole state. Result and note travel together
 * so tapping a result on a phone persists any note already typed in that card
 * rather than silently discarding it.
 */
export const updateInspectionItemSchema = z.object({
  inspectionId: uuid("inspection"),
  itemId: uuid("checklist item"),
  result: enumOf(INSPECTION_RESULTS, "result"),
  // Customer-safe note. The cap matches the project's other free-text fields.
  note: optionalText(2000),
});

/** completeInspection: the inspection plus an optional customer-facing summary. */
export const completeInspectionSchema = z.object({
  inspectionId: uuid("inspection"),
  summary: optionalText(2000),
});

/** removeInspectionItemPhoto: the junction row plus its owning item. */
export const removeInspectionPhotoSchema = z.object({
  inspectionId: uuid("inspection"),
  itemId: uuid("checklist item"),
  mediaId: uuid("photo"),
});

/**
 * createQuotationFromInspection: at least one finding must be chosen. The RPC
 * re-filters to attention/fail, so a client that submits a passing item simply
 * has it ignored rather than priced.
 */
export const inspectionToQuotationSchema = z.object({
  inspectionId: uuid("inspection"),
  itemIds: z
    .array(uuid("finding"))
    .min(1, "Select at least one finding to quote.")
    .max(200, "Too many findings were selected."),
});

/** generateInspectionShare: inspection + link lifetime in whole days. */
export const generateInspectionShareSchema = z.object({
  inspectionId: uuid("inspection"),
  expiresInDays: numberField({
    label: "link duration",
    def: SHARE_EXPIRY_DEFAULT_DAYS,
    min: SHARE_EXPIRY_MIN_DAYS,
    max: SHARE_EXPIRY_MAX_DAYS,
    integer: true,
  }),
});

/** revokeInspectionShare: inspection id only -- the RPC does the real gating. */
export const revokeInspectionShareSchema = z.object({
  inspectionId: uuid("inspection"),
});

/**
 * The public share token as it arrives in the URL path: exactly 43 base64url
 * characters, which is 32 random bytes with no padding. Anything else is
 * rejected without a database round trip, and -- critically -- with the same
 * outcome as an unknown token, so a malformed token is not distinguishable
 * from a revoked one.
 */
const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedShareToken(token) {
  return typeof token === "string" && SHARE_TOKEN_RE.test(token);
}
