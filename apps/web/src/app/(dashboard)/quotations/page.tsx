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
import { formatCurrency } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Quotation } from "@/lib/database.types";
import { QUOTE_STATUS_VARIANT } from "./status";

type Row = Pick<
  Quotation,
  "id" | "quote_number" | "status" | "total" | "currency" | "created_at"
> & { customer: { full_name: string } | null };

export default async function QuotationsPage() {
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
        title="Quotations"
        description="Quotes, product transparency, and digital approvals."
        action={
          canManage ? (
            <Link href="/quotations/new" className={buttonVariants()}>
              New quote
            </Link>
          ) : undefined
        }
      />
      <div className="p-6">
        {error ? (
          <p className="text-destructive text-sm">{error.message}</p>
        ) : quotes.length === 0 ? (
          <EmptyState
            title="No quotations yet"
            description="Quotes created in this business will appear here once they are saved."
            action={
              canManage ? (
                <Link href="/quotations/new" className={buttonVariants({ variant: "secondary" })}>
                  Create your first quote
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
                  subtitle={quote.customer?.full_name ?? "No customer"}
                  meta={
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={QUOTE_STATUS_VARIANT[quote.status]}>
                        {quote.status}
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
                  <TableHead>Quote</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-end">Total</TableHead>
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
                    <TableCell>{q.customer?.full_name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={QUOTE_STATUS_VARIANT[q.status]}>
                        {q.status}
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
