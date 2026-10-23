import type { InvoiceStatus } from "@/lib/database.types";
import type { AppLocale } from "@/lib/formatters";
import { getInvoiceStatusLabel as getDisplayInvoiceStatusLabel } from "@/lib/display-labels";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

export const INVOICE_STATUS_VARIANT: Record<InvoiceStatus, BadgeVariant> = {
  draft: "secondary",
  issued: "outline",
  partially_paid: "secondary",
  paid: "default",
  void: "destructive",
};

/** Statuses an invoice can still be acted on from (not a terminal state). */
export const OPEN_INVOICE_STATUSES: InvoiceStatus[] = ["issued", "partially_paid"];

export function getInvoiceStatusLabel(status: InvoiceStatus, locale: AppLocale = "en"): string {
  return getDisplayInvoiceStatusLabel(status, locale);
}
