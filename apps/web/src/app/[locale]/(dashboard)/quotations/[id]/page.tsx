import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

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
import { getUser, requireMembership } from "@/lib/auth";
import { canManageQuotes } from "@/lib/permissions";
import { formatCurrency } from "@/lib/money";
import { formatDateTime } from "@/lib/formatters";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { Approval, Quotation, QuotationItem } from "@/lib/database.types";

import { AddItemForm } from "./add-item-form";
import { QuoteDetailsForm } from "./quote-details-form";
import { ApproveForm, RemoveItemButton, SendQuoteButton } from "./quote-actions";
import { getQuoteStatusLabel, QUOTE_STATUS_VARIANT } from "../status";

type QuoteWithRelations = Quotation & {
  customer: {
    full_name: string;
    app_user_id: string | null;
    preferred_language: string;
  } | null;
  vehicle: { make: string | null; model: string | null; plate_number: string | null } | null;
};

function transparencySummary(item: QuotationItem): string {
  if (!item.product_category) return "—";
  const t = item.transparency as Record<string, string | null>;
  return [item.product_category, t.brand, t.warranty]
    .filter(Boolean)
    .join(" · ");
}

export default async function QuoteBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member, business } = await requireMembership();
  const isStaff = canManageQuotes(member.role);
  const user = await getUser();
  const locale = await getLocale();
  const supabase = await createClient();
  const t = await getTranslations("dashboardQuotations.detail");

  const { data } = await supabase
    .from("quotations")
    .select(
      "*, customer:customers(full_name, app_user_id, preferred_language), vehicle:vehicles(make, model, plate_number)",
    )
    .eq("business_id", business.id)
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const quote = data as unknown as QuoteWithRelations;

  const { data: itemRows } = await supabase
    .from("quotation_items")
    .select("*")
    .eq("business_id", business.id)
    .eq("quotation_id", id)
    .order("created_at", { ascending: true });
  const items = (itemRows ?? []) as QuotationItem[];

  const { data: approvalRow } = await supabase
    .from("approvals")
    .select("*")
    .eq("business_id", business.id)
    .eq("quotation_id", id)
    .eq("quotation_version", quote.current_version)
    .maybeSingle();
  const approval = approvalRow as Approval | null;

  const isDraft = quote.status === "draft";
  const isSent = quote.status === "sent";
  const isApproved = !!approval || quote.status === "approved";
  const isDeclined = quote.status === "declined";
  const isLinkedCustomer =
    !!user && !!quote.customer?.app_user_id && quote.customer.app_user_id === user.id;
  const canEditItems = isStaff && isDraft;
  const approvalNote = (approval?.device_data as Record<string, string | null> | null)
    ?.customer_note;

  const vehicleLabel = quote.vehicle
    ? [quote.vehicle.make, quote.vehicle.model].filter(Boolean).join(" ") +
      (quote.vehicle.plate_number ? ` · ${quote.vehicle.plate_number}` : "")
    : null;

  return (
    <>
      <PageHeader
        title={
            <span className="flex items-center gap-3">
            {quote.quote_number}
            <Badge variant={QUOTE_STATUS_VARIANT[quote.status]}>
              {getQuoteStatusLabel(quote.status, locale)}
            </Badge>
          </span>
        }
        description={[quote.customer?.full_name, vehicleLabel]
          .filter(Boolean)
          .join(" · ")}
        action={
          <Link
            href="/quotations"
            className={buttonVariants({ variant: "outline" })}
          >
            {t("back")}
          </Link>
        }
      />

      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("lineItems")}</CardTitle>
            <CardDescription>
              {t("lineItemsDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {items.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noItems")}</p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("thItem")}</TableHead>
                      <TableHead>{t("thType")}</TableHead>
                      <TableHead>{t("thTransparency")}</TableHead>
                      <TableHead className="text-end">{t("thQty")}</TableHead>
                      <TableHead className="text-end">{t("thUnit")}</TableHead>
                      <TableHead className="text-end">{t("thTotal")}</TableHead>
                      {canEditItems && <TableHead />}
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
                          {formatCurrency(item.unit_price, quote.currency)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {formatCurrency(item.total, quote.currency)}
                        </TableCell>
                        {canEditItems && (
                          <TableCell className="text-end">
                            <RemoveItemButton
                              itemId={item.id}
                              quotationId={quote.id}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <dl className="ms-auto grid w-full max-w-xs gap-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("subtotal")}</dt>
                <dd className="tabular-nums">
                  {formatCurrency(quote.subtotal, quote.currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("discount")}</dt>
                <dd className="tabular-nums">
                  −{formatCurrency(quote.discount_total, quote.currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("tax")}</dt>
                <dd className="tabular-nums">
                  {formatCurrency(quote.tax_total, quote.currency)}
                </dd>
              </div>
              <div className="mt-1 flex items-baseline justify-between border-t pt-2 text-base font-semibold">
                <dt>{t("total")}</dt>
                <dd className="text-primary tabular-nums">
                  {formatCurrency(quote.total, quote.currency)}
                </dd>
              </div>
            </dl>

            {canEditItems && (
              <div className="border-t pt-6">
                <AddItemForm quotationId={quote.id} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("details")}</CardTitle>
          </CardHeader>
          <CardContent>
            <QuoteDetailsForm
              quote={quote}
              disabled={!isStaff || !isDraft}
              redirectTo="/quotations"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("approval")}</CardTitle>
            <CardDescription>
              {t("approvalDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isApproved ? (
              <StatusBanner
                tone="success"
                title={`${getQuoteStatusLabel("approved", locale)}${
                  approval ? ` on ${formatDateTime(approval.approved_at, undefined, locale)}` : ""
                }`}
              >
                {approval && (
                  <p>
                    Signed by{" "}
                    {(approval.device_data as Record<string, string>)
                      ?.signed_name ?? "customer"}{" "}
                    · version {approval.quotation_version}
                  </p>
                )}
                {approvalNote && <p>Note: {approvalNote}</p>}
              </StatusBanner>
            ) : isDeclined ? (
              <StatusBanner
                tone="destructive"
                title={`${getQuoteStatusLabel("declined", locale)}${
                  quote.customer_rejected_at
                    ? ` on ${formatDateTime(quote.customer_rejected_at, undefined, locale)}`
                    : ""
                }`}
              >
                {quote.customer_rejection_note && (
                  <p>Reason: {quote.customer_rejection_note}</p>
                )}
              </StatusBanner>
            ) : isDraft ? (
              <div className="flex flex-col gap-4">
                <p className="text-muted-foreground text-sm">
                  {items.length === 0
                    ? "Add at least one line item before sending."
                    : "Send the quote to collect the customer's digital approval."}
                </p>
                {isStaff && items.length > 0 && (
                  <SendQuoteButton quotationId={quote.id} />
                )}
              </div>
            ) : isSent && isLinkedCustomer ? (
              <ApproveForm
                quotationId={quote.id}
                businessId={quote.business_id}
                customerId={quote.customer_id}
                version={quote.current_version}
                language={quote.customer?.preferred_language ?? quote.language}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                Awaiting customer approval.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
