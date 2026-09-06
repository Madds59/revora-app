import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { PageHeader } from "@/components/page-header";
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
import { getLocale, getTranslations } from "next-intl/server";
import { formatCurrency } from "@/lib/money";
import { getInvoiceStatusLabel, INVOICE_STATUS_VARIANT } from "@/lib/invoices";
import { createClient } from "@/lib/supabase/server";
import type { Invoice } from "@/lib/database.types";

type Row = Pick<
  Invoice,
  "id" | "invoice_number" | "status" | "total" | "amount_paid" | "currency" | "created_at"
> & { customer: { full_name: string } | null };

export default async function InvoicesPage() {
  const t = await getTranslations("dashboardInvoices");
  const tError = await getTranslations("error");
  const locale = await getLocale();
  const { business } = await requireMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, status, total, amount_paid, currency, created_at, customer:customers(full_name)",
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });
  if (error) console.error("InvoicesPage failed to load", error);
  const invoices = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="p-6">
        {error ? (
          <p className="text-destructive text-sm">{tError("description")}</p>
        ) : invoices.length === 0 ? (
          <EmptyState title={t("empty.title")} description={t("empty.description")} />
        ) : (
          <>
            <MobileDataList
              items={invoices}
              empty={null}
              getKey={(invoice) => invoice.id}
              renderItem={(invoice) => (
                <MobileDataCard
                  title={
                    <Link href={`/invoices/${invoice.id}`} className="hover:underline">
                      {invoice.invoice_number ?? t("fallback.draft")}
                    </Link>
                  }
                  subtitle={invoice.customer?.full_name ?? t("fallback.none")}
                  meta={
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>
                        {getInvoiceStatusLabel(invoice.status, locale)}
                      </Badge>
                      <span>{formatCurrency(invoice.total, invoice.currency)}</span>
                    </div>
                  }
                />
              )}
            />

            <div className="hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.invoice")}</TableHead>
                    <TableHead>{t("table.customer")}</TableHead>
                    <TableHead>{t("table.status")}</TableHead>
                    <TableHead className="text-end">{t("table.total")}</TableHead>
                    <TableHead className="text-end">{t("table.balance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                          {inv.invoice_number ?? t("fallback.draft")}
                        </Link>
                      </TableCell>
                      <TableCell>{inv.customer?.full_name ?? t("fallback.none")}</TableCell>
                      <TableCell>
                        <Badge variant={INVOICE_STATUS_VARIANT[inv.status]}>
                          {getInvoiceStatusLabel(inv.status, locale)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatCurrency(inv.total, inv.currency)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatCurrency(inv.total - inv.amount_paid, inv.currency)}
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
