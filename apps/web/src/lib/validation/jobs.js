// Job server-action input schemas (APPSEC-09 Phase 1).
// Status allowlist mirrors the Postgres job_status enum.

import { z } from "zod";
import { enumOf, optionalEnumOf, optionalText, requiredText, uuid } from "./common.js";

export const JOB_STATUSES = [
  "pending",
  "approved",
  "in_progress",
  "waiting_parts",
  "delayed",
  "completed",
  "cancelled",
];

/** updateJobStatus: job id + strict status. */
export const updateJobStatusSchema = z.object({
  id: uuid("job"),
  status: enumOf(JOB_STATUSES, "status"),
});

/** postJobUpdate: required message, optional status advance. */
export const postJobUpdateSchema = z.object({
  jobId: uuid("job"),
  message: requiredText("Update message", 5000),
  status: optionalEnumOf(JOB_STATUSES, "status"),
});

/** addJobTask: required title, optional description. */
export const addJobTaskSchema = z.object({
  jobId: uuid("job"),
  title: requiredText("Task title", 500),
  description: optionalText(2000),
});

/** toggleJobTask: task + job identifiers. */
export const toggleJobTaskSchema = z.object({
  id: uuid("task"),
  jobId: uuid("job"),
});
