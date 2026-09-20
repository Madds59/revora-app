import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileCheck2, ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { reportError } from "@/lib/observability";
import { formatCurrency } from "@/lib/money";
import type { Quotation } from "@/lib/database.types";

type PendingQuote = Pick<
  Quotation,
  "id" | "quote_number" | "total" | "currency"
> & { business: { name: string } | null };

export async function PendingQuotesSection({
  customerIds,
}: {
  customerIds: string[];
}) {
  const t = await getTranslations("portalHome");
  const supabase = await createClient();

  // Quotes sent to this customer and awaiting their approval (RLS-scoped).
  const { data: pendingData, error } = await supabase
    .from("quotations")
    .select("id, quote_number, total, currency, business:businesses(name)")
    .eq("status", "sent")
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });
  if (error) {
    reportError(error, { section: "portal", extra: { part: "pendingQuotes" } });
  }
  const pendingQuotes = (pendingData ?? []) as unknown as PendingQuote[];

  if (pendingQuotes.length === 0) return null;

  return (
    <Card className="border-primary/25 overflow-hidden">
      <div aria-hidden className="uae-flag-stripe h-1 w-full" />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCheck2 className="text-primary size-5" />
          {t("quotesAwaitingApproval")}
        </CardTitle>
        <CardDescription>{t("reviewAndApproveDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {pendingQuotes.map((quote) => (
            <Link
              key={quote.id}
              href={`/portal/quotes/${quote.id}`}
              className="hover:border-primary/40 hover:bg-primary/[0.04] flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 transition-colors"
            >
              <div>
                <div className="font-medium">{quote.quote_number}</div>
                <div className="text-muted-foreground text-xs">
                  {quote.business?.name ?? t("workshop")}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold tabular-nums">
                  {formatCurrency(quote.total, quote.currency)}
                </span>
                <Badge>{t("reviewAndApprove")}</Badge>
                <ArrowRight className="text-muted-foreground size-4 rtl:rotate-180" />
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
