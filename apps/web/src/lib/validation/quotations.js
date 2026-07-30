// Quotation server-action input schemas (APPSEC-09 Phase 1).
// Enum allowlists mirror the Postgres enums (item_kind, product_category).

import { z } from "zod";
import {
  enumOf,
  money,
  optionalEnumOf,
  optionalText,
  optionalUuid,
  optionalDateString,
  percentRate,
  quantity,
  requiredText,
  uuid,
} from "./common.js";

export const ITEM_KINDS = ["service", "labor", "product", "part"];
export const PRODUCT_CATEGORIES = [
  "oem",
  "genuine",
  "aftermarket",
  "refurbished",
  "used",
  "custom",
];
export const QUOTE_APPROVAL_LANGUAGES = ["en", "ar"];

/** quotation_version: positive integer, default 1 when blank. */
const quotationVersion = z.preprocess((v) => {
  if (v === undefined || v === null || String(v).trim() === "") return 1;
  return Number(String(v).trim());
}, z
  .number({ message: "Invalid quotation version." })
  .refine((n) => Number.isInteger(n) && n >= 1, "Invalid quotation version."));

/** approval language: en/ar, default en. */
const approvalLanguage = z.preprocess(
  (v) => (v === undefined || v === null || String(v).trim() === "" ? "en" : v),
  z
    .any()
    .refine(
      (v) => QUOTE_APPROVAL_LANGUAGES.includes(v),
      "Please choose a valid language.",
    ),
);

/** createQuote: customer required, vehicle optional. */
export const createQuoteSchema = z.object({
  customerId: uuid("customer"),
  vehicleId: optionalUuid("vehicle"),
});

/** addItem: one quotation line item. */
export const addItemSchema = z.object({
  quotationId: uuid("quotation"),
  name: requiredText("Item name", 500),
  kind: enumOf(ITEM_KINDS, "item type"),
  productCategory: optionalEnumOf(PRODUCT_CATEGORIES, "product category"),
  quantity,
  unitPrice: money("unit price"),
  discountAmount: money("discount"),
  taxRate: percentRate("tax rate"),
  description: optionalText(5000),
  brand: optionalText(200),
  warranty: optionalText(500),
  origin: optionalText(200),
  supplier: optionalText(200),
  expectedLifespan: optionalText(200),
});

/** removeItem: identifiers only. */
export const removeItemSchema = z.object({
  itemId: uuid("item"),
  quotationId: uuid("quotation"),
});

/** updateQuoteDetails: free-text/date fields on an existing quote. */
export const updateQuoteDetailsSchema = z.object({
  id: uuid("quotation"),
  expectedCompletionDate: optionalDateString,
  warrantyTerms: optionalText(5000),
  customerNotes: optionalText(5000),
  internalNotes: optionalText(5000),
});

/** sendQuote: identifier only (status transition draft -> sent). */
export const sendQuoteSchema = z.object({
  id: uuid("quotation"),
});

/**
 * approveQuote (customer digital approval). businessId/customerId are
 * client-supplied here because the approver is a customer (not a business
 * member); they are validated as UUIDs and the actual customer-ownership match
 * is still enforced by RLS (`approvals_customer_insert`).
 */
export const approveQuoteSchema = z.object({
  quotationId: uuid("quotation"),
  businessId: uuid("business"),
  customerId: uuid("customer"),
  quotationVersion,
  language: approvalLanguage,
  signature: requiredText("Signature", 200),
  customerNote: optionalText(2000),
});

/**
 * Portal rejectQuote (APPSEC-09 Phase 2). businessId/customerId are account
 * selectors validated for shape; the action must resolve them against the
 * session's linked accounts and pass only session-derived identifiers to the
 * `customer_reject_quote` RPC (which re-checks ownership under SECURITY DEFINER).
 */
export const rejectQuoteSchema = z.object({
  quotationId: uuid("quotation"),
  businessId: uuid("business"),
  customerId: uuid("customer"),
  rejectionNote: optionalText(2000),
});
