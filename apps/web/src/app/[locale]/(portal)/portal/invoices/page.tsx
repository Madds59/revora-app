import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { getInvoiceStatusLabel, INVOICE_STATUS_VARIANT } from "@/lib/invoices";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import type { Invoice } from "@/lib/database.types";

type Row = Pick<Invoice, "id" | "invoice_number" | "status" | "total" | "currency"> & {
  business: { name: string } | null;
};

export default async function PortalInvoicesPage() {
  const locale = await getLocale();
  const { accounts } = await requireCustomerPortal();
  const supabase = await createClient();
  const customerIds = accounts.map((account) => account.id);

  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, total, currency, business:businesses(name)")
    .in("customer_id", customerIds.length > 0 ? customerIds : ["00000000-0000-0000-0000-000000000000"])
    .neq("status", "draft")
    .order("created_at", { ascending: false });
  if (error) console.error("PortalInvoicesPage failed to load", error);
  const invoices = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader title="Invoices" description="Invoices issued to you by your workshops." />
      <div className="p-6">
        {invoices.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground p-10 text-center text-sm">
              No invoices yet.
            </CardContent>
          </Card>
        ) : (
          <>
            <MobileDataList
              items={invoices}
              empty={null}
              getKey={(inv) => inv.id}
              renderItem={(inv) => (
                <MobileDataCard
                  title={
                    <Link href={`/portal/invoices/${inv.id}`} className="hover:underline">
                      {inv.invoice_number}
                    </Link>
                  }
                  subtitle={inv.business?.name ?? "Workshop"}
                  meta={
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={INVOICE_STATUS_VARIANT[inv.status]}>
                        {getInvoiceStatusLabel(inv.status, locale)}
                      </Badge>
                      <span>{formatCurrency(inv.total, inv.currency)}</span>
                    </div>
                  }
                />
              )}
            />
            <div className="hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Workshop</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-end">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <Link href={`/portal/invoices/${inv.id}`} className="font-medium hover:underline">
                          {inv.invoice_number}
                        </Link>
                      </TableCell>
                      <TableCell>{inv.business?.name ?? "Workshop"}</TableCell>
                      <TableCell>
                        <Badge variant={INVOICE_STATUS_VARIANT[inv.status]}>
                          {getInvoiceStatusLabel(inv.status, locale)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatCurrency(inv.total, inv.currency)}
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
