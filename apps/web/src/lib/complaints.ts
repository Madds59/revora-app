import type {
  ComplaintSeverity,
  ComplaintStatus,
} from "@/lib/database.types";

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: "Open",
  assigned: "Assigned",
  awaiting_customer: "Awaiting customer",
  investigating: "Investigating",
  escalated: "Escalated",
  resolved: "Resolved",
  closed: "Closed",
};

export const COMPLAINT_SEVERITY_LABELS: Record<ComplaintSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const COMPLAINT_STATUS_VARIANT: Record<
  ComplaintStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  open: "default",
  assigned: "secondary",
  awaiting_customer: "outline",
  investigating: "secondary",
  escalated: "destructive",
  resolved: "outline",
  closed: "outline",
};

export const COMPLAINT_SEVERITY_VARIANT: Record<
  ComplaintSeverity,
  "default" | "secondary" | "destructive" | "outline"
> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  critical: "destructive",
};
