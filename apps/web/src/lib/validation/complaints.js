// Complaint server-action input schemas (APPSEC-09 Phase 1).
// Allowlists mirror the Postgres complaint_status / complaint_severity enums.

import { z } from "zod";
import {
  optionalEnumOf,
  optionalText,
  optionalUuid,
  requiredText,
  uuid,
} from "./common.js";

export const COMPLAINT_STATUSES = [
  "open",
  "assigned",
  "awaiting_customer",
  "investigating",
  "escalated",
  "resolved",
  "closed",
];
export const COMPLAINT_SEVERITIES = ["low", "medium", "high", "critical"];

/**
 * updateComplaint: status/severity/assignment on an existing complaint. All
 * mutable fields are optional (the action only updates those provided); each is
 * validated against its allowlist / UUID shape when present.
 */
export const updateComplaintSchema = z.object({
  complaintId: uuid("complaint"),
  status: optionalEnumOf(COMPLAINT_STATUSES, "status"),
  severity: optionalEnumOf(COMPLAINT_SEVERITIES, "severity"),
  assignedTo: optionalUuid("assignee"),
  resolutionSummary: optionalText(5000),
});

/**
 * addComplaintMessage (staff reply). Note: business_id is NOT part of this
 * schema — it is derived server-side from the session/membership, never trusted
 * from the client (APPSEC-09 hardening; RLS remains the backstop).
 */
export const addComplaintMessageSchema = z.object({
  complaintId: uuid("complaint"),
  body: requiredText("Message", 20000),
  parentMessageId: optionalUuid("message"),
});

/** Severity with the form's existing default: blank -> "medium", else allowlist. */
const severityWithDefault = z.preprocess(
  (v) =>
    v === undefined || v === null || String(v).trim() === "" ? "medium" : v,
  z
    .any()
    .refine(
      (v) => COMPLAINT_SEVERITIES.includes(v),
      "Please choose a valid severity.",
    ),
);

/**
 * Portal createComplaint (APPSEC-09 Phase 2). customerId/businessId here are
 * ACCOUNT SELECTORS only — a portal user can be linked to several customer
 * accounts, so the form posts which one the complaint is for. The action must
 * resolve them against the session's own linked accounts and mutate with the
 * session-derived row values; these client fields are never the source of truth.
 */
export const portalCreateComplaintSchema = z.object({
  customerId: uuid("account"),
  businessId: uuid("business"),
  subject: requiredText("Subject", 500),
  description: requiredText("Description", 20000),
  severity: severityWithDefault,
});

/**
 * Portal addComplaintReply (APPSEC-09 Phase 2). The complaint's tenant identity
 * is re-derived server-side from the complaint row after an explicit ownership
 * check; the client businessId is validated only as a shape check and is never
 * written to the database.
 */
export const portalComplaintReplySchema = z.object({
  complaintId: uuid("complaint"),
  businessId: uuid("business"),
  body: requiredText("Message", 20000),
  parentMessageId: optionalUuid("message"),
});
