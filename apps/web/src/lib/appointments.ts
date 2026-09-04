import type { AppointmentStatus } from "@/lib/database.types";
import type { AppLocale } from "@/lib/formatters";
import { getAppointmentStatusLabel as getDisplayAppointmentStatusLabel } from "@/lib/display-labels";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

export const APPOINTMENT_STATUS_VARIANT: Record<AppointmentStatus, BadgeVariant> = {
  requested: "secondary",
  confirmed: "default",
  declined: "destructive",
  cancelled: "outline",
  completed: "default",
  no_show: "destructive",
};

/** Statuses considered "upcoming" for a staff/customer list default view. */
export const UPCOMING_APPOINTMENT_STATUSES: AppointmentStatus[] = ["requested", "confirmed"];

export function getAppointmentStatusLabel(
  status: AppointmentStatus,
  locale: AppLocale = "en",
): string {
  return getDisplayAppointmentStatusLabel(status, locale);
}
