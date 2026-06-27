import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBanner } from "@/components/status-banner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireCustomerPortal } from "@/lib/auth";
import { formatCurrency } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Quotation } from "@/lib/database.types";
import { getLocale, getTranslations } from "next-intl/server";
import { getQuoteStatusLabel, QUOTE_STATUS_VARIANT } from "@/app/[locale]/(dashboard)/quotations/status";

type Row = Pick<
  Quotation,
  "id" | "quote_number" | "status" | "total" | "currency" | "created_at"
> & { business: { name: string } | null };

export default async function PortalQuotesPage({
  searchParams,
}: {
  searchParams?: Promise<{ quote_status?: string }>;
}) {
  const t = await getTranslations("portalQuotes");
  const tError = await getTranslations("error");
  const locale = await getLocale();
  const params = searchParams ? await searchParams : undefined;
  const { accounts } = await requireCustomerPortal();
  const supabase = await createClient();
  const customerIds = accounts.map((account) => account.id);

  const { data, error } = await supabase
    .from("quotations")
    .select(
      "id, quote_number, status, total, currency, created_at, business:businesses(name)",
    )
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });
  if (error) console.error("PortalQuotesPage failed to load", error);
  const quotes = (data ?? []) as unknown as Row[];
  const quoteStatus =
    params && typeof params === "object" && "quote_status" in params
      ? String((params as { quote_status?: string }).quote_status ?? "")
      : "";
  const quoteStatusMessage =
    quoteStatus === "approved"
      ? t("success.approved")
      : quoteStatus === "declined"
        ? t("success.declined")
        : null;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="p-6">
        {quoteStatusMessage && (
          <div className="mb-4">
            <StatusBanner tone="success" title={quoteStatusMessage} />
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle>{t("list.title")}</CardTitle>
            <CardDescription>{t("list.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-destructive text-sm">{tError("description")}</p>
            ) : quotes.length === 0 ? (
              <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
                {t("empty")}
              </div>
            ) : (
              <>
                <MobileDataList
                  items={quotes}
                  empty={null}
                  getKey={(quote) => quote.id}
                  renderItem={(quote) => (
                    <MobileDataCard
                      title={
                        <Link href={`/portal/quotes/${quote.id}`} className="font-medium hover:underline">
                          {quote.quote_number}
                        </Link>
                      }
                      subtitle={quote.business?.name ?? t("fallback.workshop")}
                      meta={
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={QUOTE_STATUS_VARIANT[quote.status]}>
                            {getQuoteStatusLabel(quote.status, locale)}
                          </Badge>
                          <span className="tabular-nums">{formatCurrency(quote.total, quote.currency)}</span>
                        </div>
                      }
                    />
                  )}
                />

                <div className="hidden rounded-lg border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("table.quote")}</TableHead>
                        <TableHead>{t("table.workshop")}</TableHead>
                        <TableHead>{t("table.status")}</TableHead>
                        <TableHead className="text-end">{t("table.total")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotes.map((q) => (
                        <TableRow key={q.id}>
                          <TableCell>
                            <Link
                              href={`/portal/quotes/${q.id}`}
                              className="font-medium hover:underline"
                            >
                              {q.quote_number}
                            </Link>
                          </TableCell>
                          <TableCell>{q.business?.name ?? t("fallback.none")}</TableCell>
                          <TableCell>
                            <Badge variant={QUOTE_STATUS_VARIANT[q.status]}>
                              {getQuoteStatusLabel(q.status, locale)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {formatCurrency(q.total, q.currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
