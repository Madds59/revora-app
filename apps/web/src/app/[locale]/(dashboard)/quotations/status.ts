import type { QuoteStatus } from "@/lib/database.types";
import type { AppLocale } from "@/lib/formatters";
import { getQuoteStatusLabel as getDisplayQuoteStatusLabel } from "@/lib/display-labels";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export const QUOTE_STATUS_VARIANT: Record<QuoteStatus, BadgeVariant> = {
  draft: "outline",
  sent: "secondary",
  revised: "secondary",
  approved: "default",
  declined: "destructive",
  expired: "destructive",
  cancelled: "destructive",
};

export function getQuoteStatusLabel(status: QuoteStatus, locale: AppLocale = "en"): string {
  return getDisplayQuoteStatusLabel(status, locale);
}
