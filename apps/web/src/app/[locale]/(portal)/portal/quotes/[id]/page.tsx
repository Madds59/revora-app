import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusBanner } from "@/components/status-banner";
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
import { requireCustomerPortal } from "@/lib/auth";
import { formatCurrency } from "@/lib/money";
import { formatDateTime } from "@/lib/formatters";
import { createClient } from "@/lib/supabase/server";
import { BusinessRatingForm } from "@/components/business-rating-form";
import type { Approval, Quotation, QuotationItem } from "@/lib/database.types";
import { QUOTE_STATUS_VARIANT } from "@/app/[locale]/(dashboard)/quotations/status";

import { ApproveForm } from "../approve-form";
import { RejectForm } from "../reject-form";

type QuoteWithBusiness = Quotation & { business: { name: string } | null };

function transparencySummary(item: QuotationItem): string {
  if (!item.product_category) return "—";
  const t = item.transparency as Record<string, string | null>;
  return [item.product_category, t.brand, t.warranty].filter(Boolean).join(" · ");
}

export default async function PortalQuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCustomerPortal();
  const supabase = await createClient();

  const { data } = await supabase
    .from("quotations")
    .select("*, business:businesses(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const quote = data as unknown as QuoteWithBusiness;

  const { data: itemRows } = await supabase
    .from("quotation_items")
    .select("*")
    .eq("quotation_id", id)
    .order("created_at", { ascending: true });
  const items = (itemRows ?? []) as QuotationItem[];

  const { data: approvalRow } = await supabase
    .from("approvals")
    .select("*")
    .eq("quotation_id", id)
    .eq("quotation_version", quote.current_version)
    .maybeSingle();
  const approval = approvalRow as Approval | null;

  const isApproved = !!approval || quote.status === "approved";
  const isDeclined = quote.status === "declined";
  const canApprove = quote.status === "sent" && !approval;
  const approvalNote = (approval?.device_data as Record<string, string | null> | null)
    ?.customer_note;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {quote.quote_number}
            <Badge variant={QUOTE_STATUS_VARIANT[quote.status]}>
              {quote.status}
            </Badge>
          </span>
        }
        description={quote.business?.name ?? undefined}
        action={
          <Link
            href="/portal/quotes"
            className={buttonVariants({ variant: "outline" })}
          >
            Back to quotes
          </Link>
        }
      />

      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Quotation</CardTitle>
            <CardDescription>
              Parts, labor, and pricing with transparency details.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {items.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                This quote has no line items yet.
              </p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Transparency</TableHead>
                      <TableHead className="text-end">Qty</TableHead>
                      <TableHead className="text-end">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.name}</div>
                          {item.description && (
                            <div className="text-muted-foreground text-xs">
                              {item.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="capitalize">{item.kind}</TableCell>
                        <TableCell className="text-muted-foreground text-xs capitalize">
                          {transparencySummary(item)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {formatCurrency(item.total, quote.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <dl className="ms-auto grid w-full max-w-xs gap-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">
                  {formatCurrency(quote.subtotal, quote.currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="tabular-nums">
                  −{formatCurrency(quote.discount_total, quote.currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="tabular-nums">
                  {formatCurrency(quote.tax_total, quote.currency)}
                </dd>
              </div>
              <div className="mt-1 flex items-baseline justify-between border-t pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="text-primary tabular-nums">
                  {formatCurrency(quote.total, quote.currency)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Approval</CardTitle>
            <CardDescription>
              Approve or decline with a note. This is recorded with a timestamp
              for your records.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isApproved ? (
              <StatusBanner
                tone="success"
              title={`Approved${
                approval
                    ? ` on ${formatDateTime(approval.approved_at)}`
                    : ""
                }`}
              >
                {approval && (
                  <p>
                    Signed by{" "}
                    {(approval.device_data as Record<string, string>)
                      ?.signed_name ?? "you"}
                  </p>
                )}
                {approvalNote && <p>Note: {approvalNote}</p>}
              </StatusBanner>
            ) : isDeclined ? (
              <StatusBanner
                tone="destructive"
              title={`Declined${
                quote.customer_rejected_at
                    ? ` on ${formatDateTime(quote.customer_rejected_at)}`
                    : ""
                }`}
              >
                {quote.customer_rejection_note && (
                  <p>Reason: {quote.customer_rejection_note}</p>
                )}
              </StatusBanner>
            ) : canApprove ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="border-primary/20 bg-primary/[0.04] rounded-lg border p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <ShieldCheck className="text-primary size-4" />
                    <span className="text-sm font-medium">
                      Approve this quotation
                    </span>
                  </div>
                  <ApproveForm
                    quotationId={quote.id}
                    businessId={quote.business_id}
                    customerId={quote.customer_id}
                    version={quote.current_version}
                    language={quote.language}
                  />
                </div>
                <div className="rounded-lg border border-dashed p-4">
                  <div className="mb-4 text-sm font-medium">
                    Prefer to decline?
                  </div>
                  <RejectForm
                    quotationId={quote.id}
                    businessId={quote.business_id}
                    customerId={quote.customer_id}
                  />
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                This quote isn&apos;t ready for approval yet. You&apos;ll be
                able to approve it once the workshop sends it to you.
              </p>
            )}
          </CardContent>
        </Card>

        <BusinessRatingForm
          businessId={quote.business_id}
          customerId={quote.customer_id}
        />
      </div>
    </>
  );
}
