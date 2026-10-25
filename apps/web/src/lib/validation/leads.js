// Lead work-queue server-action input schemas.
// Allowlists mirror the leads_status_check / leads_urgency_check constraints
// in migration 0048, so a value the database would reject never reaches it.

import { z } from "zod";
import { optionalEnumOf, optionalText, optionalUuid, uuid } from "./common.js";

export const LEAD_STATUSES = [
  "new",
  "triaging",
  "qualified",
  "booked",
  "converted",
  "lost",
  "spam",
  "duplicate",
];

export const LEAD_URGENCIES = ["unknown", "low", "medium", "high", "critical"];

/**
 * updateLead: status, urgency and assignment on an existing lead. Every
 * mutable field is optional because the action only writes what was submitted.
 *
 * business_id is deliberately NOT in this schema. It is derived server-side
 * from the session's membership and never trusted from the client, matching
 * updateComplaintSchema; RLS and 0048's composite foreign keys remain the
 * backstop.
 */
export const updateLeadSchema = z.object({
  leadId: uuid("lead"),
  status: optionalEnumOf(LEAD_STATUSES, "status"),
  urgency: optionalEnumOf(LEAD_URGENCIES, "urgency"),
  assignedTo: optionalUuid("assignee"),
  summary: optionalText(2000),
});

/**
 * convertLead: turn an inquiry into a customer record.
 *
 * fullName is optional: the inbound routes often know only a channel handle,
 * so the form pre-fills what it has and the action falls back to the channel
 * display name rather than refusing. phone and email are optional for the same
 * reason -- a DM carries neither.
 */
export const convertLeadSchema = z.object({
  leadId: uuid("lead"),
  fullName: optionalText(200),
  phone: optionalText(40),
  email: optionalText(200),
});
