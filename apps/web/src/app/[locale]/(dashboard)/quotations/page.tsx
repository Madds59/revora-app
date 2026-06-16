import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireMembership } from "@/lib/auth";
import { canManageQuotes } from "@/lib/permissions";
import { getLocale, getTranslations } from "next-intl/server";
import { formatCurrency } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Quotation } from "@/lib/database.types";
import { getQuoteStatusLabel, QUOTE_STATUS_VARIANT } from "./status";

type Row = Pick<
  Quotation,
  "id" | "quote_number" | "status" | "total" | "currency" | "created_at"
> & { customer: { full_name: string } | null };

export default async function QuotationsPage() {
  const t = await getTranslations("dashboardQuotations");
  const locale = await getLocale();
  const { member, business } = await requireMembership();
  const canManage = canManageQuotes(member.role);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quotations")
    .select(
      "id, quote_number, status, total, currency, created_at, customer:customers(full_name)",
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });
  const quotes = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
          canManage ? (
            <Link href="/quotations/new" className={buttonVariants()}>
              {t("actions.newQuote")}
            </Link>
          ) : undefined
        }
      />
      <div className="p-6">
        {error ? (
          <p className="text-destructive text-sm">{error.message}</p>
        ) : quotes.length === 0 ? (
          <EmptyState
            title={t("empty.title")}
            description={t("empty.description")}
            action={
              canManage ? (
                <Link href="/quotations/new" className={buttonVariants({ variant: "secondary" })}>
                  {t("empty.action")}
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <MobileDataList
              items={quotes}
              empty={null}
              getKey={(quote) => quote.id}
              renderItem={(quote) => (
                <MobileDataCard
                  title={
                    <Link href={`/quotations/${quote.id}`} className="hover:underline">
                      {quote.quote_number}
                    </Link>
                  }
                  subtitle={quote.customer?.full_name ?? t("fallback.noCustomer")}
                  meta={
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={QUOTE_STATUS_VARIANT[quote.status]}>
                        {getQuoteStatusLabel(quote.status, locale)}
                      </Badge>
                      <span>{formatCurrency(quote.total, quote.currency)}</span>
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
                  <TableHead>{t("table.customer")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  <TableHead className="text-end">{t("table.total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell>
                      <Link
                        href={`/quotations/${q.id}`}
                        className="font-medium hover:underline"
                      >
                        {q.quote_number}
                      </Link>
                    </TableCell>
                    <TableCell>{q.customer?.full_name ?? t("fallback.none")}</TableCell>
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
      </div>
    </>
  );
}
