import type { JobStatus } from "@/lib/database.types";
import type { AppLocale } from "@/lib/formatters";
import { getJobStatusLabel as getDisplayJobStatusLabel } from "@/lib/display-labels";

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  in_progress: "In progress",
  waiting_parts: "Waiting parts",
  delayed: "Delayed",
  completed: "Completed",
  cancelled: "Cancelled",
};

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

export const JOB_STATUS_VARIANT: Record<JobStatus, BadgeVariant> = {
  pending: "secondary",
  approved: "outline",
  in_progress: "default",
  waiting_parts: "secondary",
  delayed: "destructive",
  completed: "default",
  cancelled: "outline",
};

/** Statuses considered "active" (not finished). */
export const ACTIVE_JOB_STATUSES: JobStatus[] = [
  "pending",
  "approved",
  "in_progress",
  "waiting_parts",
  "delayed",
];

export function getJobStatusLabel(status: JobStatus, locale: AppLocale = "en"): string {
  return getDisplayJobStatusLabel(status, locale);
}
