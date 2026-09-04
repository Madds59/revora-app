import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireCustomerPortal } from "@/lib/auth";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/money";
import { formatDateTime } from "@/lib/formatters";
import { getInvoiceStatusLabel, INVOICE_STATUS_VARIANT } from "@/lib/invoices";
import type { Invoice, InvoiceItem } from "@/lib/database.types";

type InvoiceWithRelations = Invoice & {
  business: { name: string; trn: string | null } | null;
  vehicle: { make: string | null; model: string | null; plate_number: string | null } | null;
};

export default async function PortalInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const { accounts } = await requireCustomerPortal();
  const customerIds = accounts.map((account) => account.id);
  const supabase = await createClient();

  const { data } = await supabase
    .from("invoices")
    .select("*, business:businesses(name, trn), vehicle:vehicles(make, model, plate_number)")
    .in("customer_id", customerIds.length > 0 ? customerIds : ["00000000-0000-0000-0000-000000000000"])
    .neq("status", "draft")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const invoice = data as unknown as InvoiceWithRelations;

  const { data: itemRows } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("position", { ascending: true });
  const items = (itemRows ?? []) as InvoiceItem[];

  const v = invoice.vehicle;
  const vehicleLabel = v
    ? [v.make, v.model].filter(Boolean).join(" ") + (v.plate_number ? ` · ${v.plate_number}` : "")
    : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {invoice.invoice_number}
            <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>
              {getInvoiceStatusLabel(invoice.status, locale)}
            </Badge>
          </span>
        }
        description={[invoice.business?.name, vehicleLabel].filter(Boolean).join(" · ")}
        action={
          <Link href={`/${locale}/portal/invoices`} className={buttonVariants({ variant: "outline" })}>
            Back
          </Link>
        }
      />
      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-end">Qty</TableHead>
                    <TableHead className="text-end">Unit price</TableHead>
                    <TableHead className="text-end">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell className="text-end tabular-nums">{item.quantity}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatCurrency(item.unit_price, invoice.currency)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatCurrency(item.total, invoice.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>{formatCurrency(invoice.tax_total, invoice.currency)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Total</span>
                <span>{formatCurrency(invoice.total, invoice.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid</span>
                <span>{formatCurrency(invoice.amount_paid, invoice.currency)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Balance due</span>
                <span>{formatCurrency(invoice.balance_due, invoice.currency)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tax details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {invoice.business_trn && (
              <div>
                <span className="text-muted-foreground">Business TRN: </span>
                {invoice.business_trn}
              </div>
            )}
            {invoice.issued_at && (
              <div>
                <span className="text-muted-foreground">Issued: </span>
                {formatDateTime(invoice.issued_at, undefined, locale)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
