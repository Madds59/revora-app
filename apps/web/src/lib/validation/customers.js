// Customer server-action input schemas (APPSEC-09 Phase 3).
//
// Rules are evidence-based, taken from the existing customer form
// (customers/customer-form.tsx) and the `customers` table: `full_name` is the
// only required field, phone/email are optional free text, and
// `preferred_language` is a two-option Select (en/ar) backed by a
// `text not null default 'en'` column.
//
// business_id, created_by and tenant scope are NEVER part of these schemas —
// they are derived from the authenticated membership in the action.

import { z } from "zod";
import {
  enumOf,
  optionalEmail,
  optionalPhone,
  requiredText,
  uuid,
} from "./common.js";

/** Matches the customer form's language Select options. */
export const CUSTOMER_LANGUAGES = ["en", "ar"];

/** Language with the form's existing default: blank -> "en", else allowlist. */
const preferredLanguage = z.preprocess(
  (v) => (v === undefined || v === null || String(v).trim() === "" ? "en" : v),
  enumOf(CUSTOMER_LANGUAGES, "language"),
);

const customerFields = {
  fullName: requiredText("Customer name", 200),
  phone: optionalPhone(),
  email: optionalEmail(),
  preferredLanguage,
};

/** createCustomer: no id; tenant scope comes from the session. */
export const createCustomerSchema = z.object(customerFields);

/** updateCustomer: same fields plus the target id. */
export const updateCustomerSchema = z.object({
  id: uuid("customer"),
  ...customerFields,
});

// No archive/restore/merge/note schemas exist here on purpose: the customer
// surface currently has no such mutation actions (the soft-delete columns are
// read-filtered only). See INPUT_VALIDATION_STANDARD.md.
