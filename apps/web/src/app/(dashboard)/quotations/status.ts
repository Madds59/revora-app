import type { QuoteStatus } from "@/lib/database.types";

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
