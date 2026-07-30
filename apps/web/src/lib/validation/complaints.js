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
