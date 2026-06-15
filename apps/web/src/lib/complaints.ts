import type {
  ComplaintSeverity,
  ComplaintStatus,
} from "@/lib/database.types";

const COMPLAINT_STATUS_LABELS_EN: Record<ComplaintStatus, string> = {
  open: "Open",
  assigned: "Assigned",
  awaiting_customer: "Awaiting customer",
  investigating: "Investigating",
  escalated: "Escalated",
  resolved: "Resolved",
  closed: "Closed",
};

const COMPLAINT_STATUS_LABELS_AR: Record<ComplaintStatus, string> = {
  open: "مفتوحة",
  assigned: "مُسندة",
  awaiting_customer: "بانتظار العميل",
  investigating: "قيد التحقيق",
  escalated: "مصعّدة",
  resolved: "محلولة",
  closed: "مغلقة",
};

const COMPLAINT_SEVERITY_LABELS_EN: Record<ComplaintSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const COMPLAINT_SEVERITY_LABELS_AR: Record<ComplaintSeverity, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  critical: "حرجة",
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

export function getComplaintStatusLabel(
  status: ComplaintStatus,
  locale: "en" | "ar" = "en",
): string {
  return locale === "ar" ? COMPLAINT_STATUS_LABELS_AR[status] : COMPLAINT_STATUS_LABELS_EN[status];
}

export function getComplaintSeverityLabel(
  severity: ComplaintSeverity,
  locale: "en" | "ar" = "en",
): string {
  return locale === "ar"
    ? COMPLAINT_SEVERITY_LABELS_AR[severity]
    : COMPLAINT_SEVERITY_LABELS_EN[severity];
}

export const COMPLAINT_STATUS_LABELS = COMPLAINT_STATUS_LABELS_EN;
export const COMPLAINT_SEVERITY_LABELS = COMPLAINT_SEVERITY_LABELS_EN;
