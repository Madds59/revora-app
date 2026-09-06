import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
import { requireMembership } from "@/lib/auth";
import { canManageInvoices } from "@/lib/permissions";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/money";
import { formatDateTime } from "@/lib/formatters";
import { getInvoiceStatusLabel, INVOICE_STATUS_VARIANT } from "@/lib/invoices";
import type {
  Invoice,
  InvoiceCreditNote,
  InvoiceItem,
  InvoicePayment,
} from "@/lib/database.types";

import {
  AddInvoiceItemForm,
  CreditNoteForm,
  IssueInvoiceForm,
  RecordPaymentForm,
  RemoveInvoiceItemButton,
  VoidInvoiceForm,
} from "../invoice-controls";

type InvoiceWithRelations = Invoice & {
  customer: { full_name: string } | null;
  vehicle: { make: string | null; model: string | null; plate_number: string | null } | null;
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member, business } = await requireMembership();
  const canManage = canManageInvoices(member.role);
  const locale = await getLocale();
  const supabase = await createClient();

  const { data } = await supabase
    .from("invoices")
    .select("*, customer:customers(full_name), vehicle:vehicles(make, model, plate_number)")
    .eq("business_id", business.id)
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const invoice = data as unknown as InvoiceWithRelations;

  const [{ data: itemRows }, { data: paymentRows }, { data: creditRows }] = await Promise.all([
    supabase
      .from("invoice_items")
      .select("*")
      .eq("business_id", business.id)
      .eq("invoice_id", id)
      .order("position", { ascending: true }),
    supabase
      .from("invoice_payments")
      .select("*")
      .eq("business_id", business.id)
      .eq("invoice_id", id)
      .order("paid_at", { ascending: false }),
    supabase
      .from("invoice_credit_notes")
      .select("*")
      .eq("business_id", business.id)
      .eq("invoice_id", id)
      .order("created_at", { ascending: false }),
  ]);
  const items = (itemRows ?? []) as InvoiceItem[];
  const payments = (paymentRows ?? []) as InvoicePayment[];
  const creditNotes = (creditRows ?? []) as InvoiceCreditNote[];

  const v = invoice.vehicle;
  const vehicleLabel = v
    ? [v.make, v.model].filter(Boolean).join(" ") + (v.plate_number ? ` · ${v.plate_number}` : "")
    : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {invoice.invoice_number ?? "Draft invoice"}
            <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>
              {getInvoiceStatusLabel(invoice.status, locale)}
            </Badge>
          </span>
        }
        description={[invoice.customer?.full_name, vehicleLabel].filter(Boolean).join(" · ")}
        action={
          <Link href={`/${locale}/invoices`} className={buttonVariants({ variant: "outline" })}>
            Back to invoices
          </Link>
        }
      />

      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {items.length === 0 ? (
              <p className="text-muted-foreground text-sm">No items yet.</p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-end">Qty</TableHead>
                      <TableHead className="text-end">Unit price</TableHead>
                      <TableHead className="text-end">Tax</TableHead>
                      <TableHead className="text-end">Total</TableHead>
                      {canManage && invoice.status === "draft" && <TableHead />}
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
                        <TableCell className="text-end tabular-nums">{item.tax_rate}%</TableCell>
                        <TableCell className="text-end tabular-nums">
                          {formatCurrency(item.total, invoice.currency)}
                        </TableCell>
                        {canManage && invoice.status === "draft" && (
                          <TableCell className="text-end">
                            <RemoveInvoiceItemButton id={item.id} invoiceId={invoice.id} />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-{formatCurrency(invoice.discount_total, invoice.currency)}</span>
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

            {canManage && invoice.status === "draft" && (
              <AddInvoiceItemForm invoiceId={invoice.id} />
            )}
          </CardContent>
        </Card>

        {canManage && invoice.status === "draft" && (
          <Card>
            <CardHeader>
              <CardTitle>Issue this invoice</CardTitle>
              <CardDescription>
                Assigns the sequential invoice number and freezes the business TRN onto the
                document. Requires a TRN set in business settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <IssueInvoiceForm invoiceId={invoice.id} />
            </CardContent>
          </Card>
        )}

        {canManage && (invoice.status === "issued" || invoice.status === "partially_paid") && (
          <Card>
            <CardHeader>
              <CardTitle>Record a payment</CardTitle>
            </CardHeader>
            <CardContent>
              <RecordPaymentForm invoiceId={invoice.id} />
            </CardContent>
          </Card>
        )}

        {payments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span>
                    {p.method.replaceAll("_", " ")} · {formatDateTime(p.paid_at, undefined, locale)}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </span>
                  <span className="font-medium">{formatCurrency(p.amount, invoice.currency)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {creditNotes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Credit notes</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {creditNotes.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span>
                    {c.credit_note_number} · {c.reason} · {formatDateTime(c.created_at, undefined, locale)}
                  </span>
                  <span className="font-medium">-{formatCurrency(c.amount, invoice.currency)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {canManage &&
          invoice.amount_paid === 0 &&
          (invoice.status === "draft" || invoice.status === "issued") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-destructive">Void this invoice</CardTitle>
              </CardHeader>
              <CardContent>
                <VoidInvoiceForm invoiceId={invoice.id} />
              </CardContent>
            </Card>
          )}

        {canManage && invoice.amount_paid > 0 && invoice.status !== "void" && (
          <Card>
            <CardHeader>
              <CardTitle>Issue a credit note</CardTitle>
              <CardDescription>
                This invoice has payments recorded, so it can no longer be voided -- a credit note
                is the correct way to reduce its net revenue while keeping the original document
                intact for the audit trail.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CreditNoteForm invoiceId={invoice.id} />
            </CardContent>
          </Card>
        )}

        {invoice.status === "void" && invoice.void_reason && (
          <Card>
            <CardHeader>
              <CardTitle>Void reason</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{invoice.void_reason}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
