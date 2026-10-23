// Invoice server-action input schemas (mirrors the APPSEC-09 convention in
// lib/validation/jobs.js / quotations.js). Enum allowlists mirror the
// Postgres invoice_status / invoice_payment_method enums (0034).

import { z } from "zod";
import {
  enumOf,
  money,
  optionalEnumOf,
  optionalText,
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
export const INVOICE_PAYMENT_METHODS = [
  "cash",
  "card_in_shop",
  "bank_transfer",
  "online_card",
  "other",
];

/** createInvoiceFromJob: job id (+ optional branch override). */
export const createInvoiceFromJobSchema = z.object({
  jobId: uuid("job"),
});

/** addInvoiceItem: line item fields, mirrors quotation_items shape. */
export const addInvoiceItemSchema = z.object({
  invoiceId: uuid("invoice"),
  kind: enumOf(ITEM_KINDS, "item type"),
  productCategory: optionalEnumOf(PRODUCT_CATEGORIES, "product category"),
  name: requiredText("Item name", 200),
  description: optionalText(2000),
  quantity,
  unitPrice: money("unit price"),
  taxRate: percentRate("tax rate"),
  discountAmount: money("discount"),
});

/** removeInvoiceItem: item + invoice identifiers. */
export const removeInvoiceItemSchema = z.object({
  id: uuid("item"),
  invoiceId: uuid("invoice"),
});

/** issueInvoice: invoice id only -- the RPC does the real gating. */
export const issueInvoiceSchema = z.object({
  invoiceId: uuid("invoice"),
});

/** recordInvoicePayment: method + amount, optional reference note. */
export const recordInvoicePaymentSchema = z.object({
  invoiceId: uuid("invoice"),
  method: enumOf(INVOICE_PAYMENT_METHODS, "payment method"),
  amount: money("payment amount").refine((n) => n > 0, "Payment amount must be greater than zero."),
  reference: optionalText(200),
  notes: optionalText(1000),
});

/** voidInvoice: invoice id + a required reason (the RPC also enforces this). */
export const voidInvoiceSchema = z.object({
  invoiceId: uuid("invoice"),
  reason: requiredText("A reason", 1000),
});

/** createInvoiceCreditNote: invoice id + positive amount + required reason. */
export const createInvoiceCreditNoteSchema = z.object({
  invoiceId: uuid("invoice"),
  amount: money("credit amount").refine((n) => n > 0, "Credit amount must be greater than zero."),
  reason: requiredText("A reason", 1000),
});
