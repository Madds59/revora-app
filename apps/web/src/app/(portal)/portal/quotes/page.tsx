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
import { QUOTE_STATUS_VARIANT } from "@/app/(dashboard)/quotations/status";

type Row = Pick<
  Quotation,
  "id" | "quote_number" | "status" | "total" | "currency" | "created_at"
> & { business: { name: string } | null };

export default async function PortalQuotesPage() {
  await requireCustomerPortal();
  const supabase = await createClient();

  // RLS (quotations_access) scopes this to quotes for the signed-in customer.
  const { data, error } = await supabase
    .from("quotations")
    .select(
      "id, quote_number, status, total, currency, created_at, business:businesses(name)",
    )
    .order("created_at", { ascending: false });
  const quotes = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader
        title="Quotes"
        description="Review and approve quotations from your workshop."
      />
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Your quotes</CardTitle>
            <CardDescription>
              Open a quote to see the line items and approve it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-destructive text-sm">{error.message}</p>
            ) : quotes.length === 0 ? (
              <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
                No quotes yet.
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
                      subtitle={quote.business?.name ?? "Workshop"}
                      meta={
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={QUOTE_STATUS_VARIANT[quote.status]}>{quote.status}</Badge>
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
                      <TableHead>Quote</TableHead>
                      <TableHead>Workshop</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-end">Total</TableHead>
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
                        <TableCell>{q.business?.name ?? "—"}</TableCell>
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
          </CardContent>
        </Card>
      </div>
    </>
  );
}
