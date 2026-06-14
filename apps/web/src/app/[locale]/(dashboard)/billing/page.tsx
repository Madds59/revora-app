import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { DetailSummaryCard } from "@/components/detail-summary-card";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
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
import { BillingPortalButton } from "@/components/billing-portal-button";
import { requireMembership } from "@/lib/auth";
import type {
  BillingInvoiceSummaryRow,
  BillingPaymentEvent,
  BillingPlanCatalogRow,
  BillingRevenueSummary,
  PaginatedListResult,
} from "@/lib/billing-views";
import {
  formatDate,
  formatDateTime,
  formatNumber,
} from "@/lib/formatters";
import { formatCurrency } from "@/lib/money";
import { canManageBusiness } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Subscription, SubscriptionItem } from "@/lib/database.types";

type SubscriptionView = Subscription & {
  items: SubscriptionItem[];
};

function formatEntitlement(value: unknown) {
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return "Unavailable";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function formatMoney(value: number, currency: string) {
  return formatCurrency(value, currency);
}

function formatPrice(amount: number | null, currency: string) {
  if (amount == null) return "Configured in Stripe";
  return formatMoney(amount / 100, currency);
}

function invoiceStatusLabel(status: BillingInvoiceSummaryRow["status"]) {
  switch (status) {
    case "draft":
      return "Draft";
    case "open":
      return "Open";
    case "paid":
      return "Paid";
    case "uncollectible":
      return "Uncollectible";
    case "void":
      return "Void";
    case "deleted":
      return "Deleted";
    default:
      return status;
  }
}

function featureValue(feature: BillingPlanCatalogRow["features"][number]) {
  if (!feature.included) return "Not included";
  if (feature.limit_value == null) return "Included";
  return `${formatNumber(feature.limit_value)}${feature.limit_unit ? ` ${feature.limit_unit}` : ""}`;
}

function currentPlanInterval(
  subscription: SubscriptionView | undefined,
  plan: BillingPlanCatalogRow | null | undefined,
) {
  if (!subscription || !plan) return "Unavailable";
  const priceIds = new Set(subscription.items.map((item) => item.stripe_price_id));
  if (plan.stripe_price_id_monthly && priceIds.has(plan.stripe_price_id_monthly)) return "monthly";
  if (plan.stripe_price_id_yearly && priceIds.has(plan.stripe_price_id_yearly)) return "yearly";
  return "unknown";
}

export default async function BillingPage() {
  const { member, business } = await requireMembership();
  if (!canManageBusiness(member.role)) {
    return (
      <>
        <PageHeader title="Billing" description="Subscription and invoice history." />
        <div className="p-6">
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Billing is available to business owners only.
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const supabase = await createClient();

  const { data: subRows, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  const subscriptions = (subRows ?? []) as Subscription[];
  const subscriptionIds = subscriptions.map((subscription) => subscription.id);
  const { data: itemRows } = subscriptionIds.length
    ? await supabase
        .from("subscription_items")
        .select("*")
        .in("subscription_id", subscriptionIds)
        .order("created_at", { ascending: true })
    : { data: [] as SubscriptionItem[] };

  const itemMap = new Map<string, SubscriptionItem[]>();
  (itemRows ?? []).forEach((item) => {
    const existing = itemMap.get(item.subscription_id) ?? [];
    existing.push(item);
    itemMap.set(item.subscription_id, existing);
  });

  const views: SubscriptionView[] = subscriptions.map((subscription) => ({
    ...subscription,
    items: itemMap.get(subscription.id) ?? [],
  }));
  const current = views[0];
  const currentPlanSlug = current?.plan_key?.toLowerCase() ?? null;

  const [
    { data: planRows, error: planError },
    { data: invoiceResult, error: invoiceError },
    { data: revenueSummaryData, error: revenueError },
    { data: paymentEventRows, error: paymentEventError },
  ] = await Promise.all([
    supabase.rpc("list_active_billing_plans"),
    supabase.rpc("list_business_billing_invoices", {
      p_business_id: business.id,
      p_limit: 25,
      p_offset: 0,
    }),
    supabase.rpc("get_business_revenue_summary", {
      p_business_id: business.id,
      p_period: "90d",
    }),
    supabase
      .from("billing_payment_events")
      .select(
        "id, business_id, invoice_id, subscription_id, stripe_payment_intent_id, stripe_charge_id, event_type, status, amount, currency, provider, provider_event_id, occurred_at, created_at",
      )
      .eq("business_id", business.id)
      .order("occurred_at", { ascending: false })
      .limit(10),
  ]);

  const plans = (planRows ?? []) as unknown as BillingPlanCatalogRow[];
  const paymentEvents = (paymentEventRows ?? []) as unknown as BillingPaymentEvent[];
  const invoiceList =
    (invoiceResult as unknown as PaginatedListResult<BillingInvoiceSummaryRow> | null) ?? {
      rows: [],
      total_count: 0,
    };
  const revenueSummary = (revenueSummaryData ?? null) as unknown as BillingRevenueSummary | null;

  const currentPlan = plans.find((plan) => plan.slug.toLowerCase() === currentPlanSlug) ?? null;
  const currentInterval = currentPlanInterval(current, currentPlan);
  const planFeatureKeys = Array.from(
    new Set(plans.flatMap((plan) => plan.features.map((feature) => feature.feature_key))),
  );
  const entitlementRecord = asRecord(current?.entitlements);
  const hasInvoiceRows = invoiceList.rows.length > 0;
  const hasPaymentEvents = paymentEvents.length > 0;
  const revenueErrorState = planError ?? invoiceError ?? revenueError ?? null;
  const paymentEventErrorState = paymentEventError ?? null;
  const billingSyncState = business.stripe_customer_id
    ? hasInvoiceRows
      ? "Stripe is connected and invoices have started syncing."
      : "Connected to Stripe, awaiting invoice sync."
    : "Stripe customer not linked yet.";

  return (
    <>
      <PageHeader
        title="Billing"
        description="Subscription, plan, and invoice history."
        action={
          <Link href="/settings/business" className={buttonVariants({ variant: "outline" })}>
            Business settings
          </Link>
        }
      />
      <div className="flex flex-col gap-6 p-6">
        {(error || revenueErrorState) && (
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="p-4 text-sm text-destructive">
              Billing data partially failed to load. The page is still showing whatever could be loaded.
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Billing portal actions</CardTitle>
            <CardDescription>
              Open the Stripe customer portal for this business or fall back to
              support if the tenant has not been linked yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {business.stripe_customer_id ? (
              <BillingPortalButton />
            ) : (
              <Link
                href={`mailto:billing@revora.app?subject=${encodeURIComponent(
                  `Billing portal request for ${business.name}`,
                )}&body=${encodeURIComponent(
                  `Please enable billing portal access for business ${business.name} (${business.id}).`,
                )}`}
                className={buttonVariants()}
              >
                Request portal access
              </Link>
            )}
            <Link
              href="/settings/business"
              className={buttonVariants({ variant: "outline" })}
            >
              Business settings
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Billing sync state</CardTitle>
            <CardDescription>{billingSyncState}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant={business.stripe_customer_id ? "default" : "outline"}>
            {business.stripe_customer_id ? "Stripe linked" : "Stripe unlinked"}
          </Badge>
            <Badge variant={hasInvoiceRows ? "default" : "outline"}>
              {hasInvoiceRows ? "Invoices synced" : "Awaiting invoices"}
            </Badge>
            <Badge variant={hasPaymentEvents ? "default" : "outline"}>
              {hasPaymentEvents ? "Payments synced" : "Awaiting payments"}
            </Badge>
          </CardContent>
        </Card>

        {current && (
          <DetailSummaryCard
            title="Current subscription"
            description="Plan state, renewal window, and billing access."
            rows={[
              { label: "Plan", value: currentPlan?.name ?? current.plan_key },
              { label: "Status", value: current.status },
              { label: "Billing interval", value: currentInterval },
              {
                label: "Current period",
                value: current.current_period_end
                  ? `${current.current_period_start ? formatDate(current.current_period_start) : "—"} → ${formatDate(current.current_period_end)}`
                  : "Unavailable",
              },
              {
                label: "Renewal",
                value: current.current_period_end ? formatDate(current.current_period_end) : "Unavailable",
              },
              {
                label: "Auto-renew",
                value: current.cancel_at_period_end ? "Disabled" : "Enabled",
              },
              {
                label: "Stripe customer",
                value: business.stripe_customer_id ? "Linked" : "Unavailable",
              },
            ]}
            status={{ label: current.status }}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Paid revenue</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {formatMoney(revenueSummary?.total_paid_revenue ?? 0, revenueSummary?.currency ?? "AED")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-muted-foreground text-xs">Last 90 days</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Open invoice amount</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {formatMoney(revenueSummary?.open_invoice_amount ?? 0, revenueSummary?.currency ?? "AED")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-muted-foreground text-xs">Outstanding balance</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Average invoice</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {formatMoney(revenueSummary?.average_invoice_value ?? 0, revenueSummary?.currency ?? "AED")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-muted-foreground text-xs">Paid invoices only</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Paid invoices</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {revenueSummary?.paid_invoices_count ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Open invoices</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {revenueSummary?.open_invoices_count ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Overdue / due</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {revenueSummary?.overdue_or_due_invoices_count ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Plan entitlements</CardTitle>
            <CardDescription>
              Feature entitlements are shown directly from the current subscription metadata.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {entitlementRecord && Object.keys(entitlementRecord).length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Object.entries(entitlementRecord).map(([key, value]) => (
                  <div key={key} className="rounded-lg border p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {key}
                    </div>
                    <div className="mt-1 text-sm">{formatEntitlement(value)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No entitlements exposed"
                description="The current subscription does not expose a feature matrix yet."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan comparison</CardTitle>
            <CardDescription>
              Data-driven plan catalog seeded from the billing backend.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {plans.length === 0 ? (
              <EmptyState
                title="Plan catalog unavailable"
                description="No active plans were returned from the billing catalog."
              />
            ) : (
              <>
                <MobileDataList
                  items={plans}
                  empty={null}
                  getKey={(plan) => plan.id}
                  renderItem={(plan) => (
                    <MobileDataCard
                      title={plan.name}
                      subtitle={plan.slug}
                      meta={
                        <div className="flex flex-wrap gap-2">
                          {plan.slug.toLowerCase() === currentPlanSlug && (
                            <Badge variant="default">Current</Badge>
                          )}
                          <span>{plan.description ?? "No description"}</span>
                        </div>
                      }
                    >
                      <div className="grid gap-2 text-xs text-muted-foreground">
                        <div>
                          Monthly: {formatPrice(plan.monthly_amount, plan.currency)}
                        </div>
                        <div>
                          Yearly: {formatPrice(plan.yearly_amount, plan.currency)}
                        </div>
                        <div className="grid gap-1">
                          {plan.features.slice(0, 4).map((feature) => (
                            <div key={feature.id} className="flex items-center justify-between gap-2">
                              <span>{feature.feature_name}</span>
                              <span className="font-medium text-foreground">
                                {featureValue(feature)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </MobileDataCard>
                  )}
                />

                <div className="hidden rounded-lg border xl:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Feature</TableHead>
                        {plans.map((plan) => (
                          <TableHead key={plan.id} className="align-top">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">{plan.name}</span>
                              <span className="text-muted-foreground text-xs">
                                {plan.slug.toUpperCase()}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                {formatPrice(plan.monthly_amount, plan.currency)}
                              </span>
                              {plan.slug.toLowerCase() === currentPlanSlug && (
                                <Badge variant="default" className="w-fit">
                                  Current
                                </Badge>
                              )}
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {planFeatureKeys.map((featureKey) => {
                        const featureName =
                          plans[0]?.features.find((feature) => feature.feature_key === featureKey)
                            ?.feature_name ?? featureKey;
                        return (
                          <TableRow key={featureKey}>
                            <TableCell className="font-medium">{featureName}</TableCell>
                            {plans.map((plan) => {
                              const feature = plan.features.find(
                                (item) => item.feature_key === featureKey,
                              );
                              return (
                                <TableCell key={plan.id} className="text-muted-foreground">
                                  {feature ? featureValue(feature) : "Not included"}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoice history</CardTitle>
            <CardDescription>
              Real invoices will appear here once the billing sync has data.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {revenueErrorState ? (
              <p className="text-sm text-destructive">
                {revenueErrorState.message}
              </p>
            ) : !hasInvoiceRows ? (
              <EmptyState
                title={
                  business.stripe_customer_id
                    ? "No invoices have synced yet"
                    : "Stripe customer not linked yet"
                }
                description={
                  business.stripe_customer_id
                    ? "Stripe is connected. Invoice rows will appear after webhook events are received."
                    : "Connect the business to a Stripe customer before invoice history can appear."
                }
              />
            ) : (
              <>
              <MobileDataList
                  items={invoiceList.rows}
                  empty={null}
                  getKey={(invoice) => invoice.id}
                  renderItem={(invoice) => (
                    <MobileDataCard
                      title={invoice.invoice_number ?? invoice.stripe_invoice_id ?? invoice.id}
                      subtitle={invoice.subscription_plan_key ?? "Invoice"}
                      meta={
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{invoiceStatusLabel(invoice.status)}</Badge>
                          <span>
                            {formatMoney(invoice.total_amount, invoice.currency)}
                          </span>
                          <span>
                            {invoice.paid_at
                              ? `Paid ${formatDate(invoice.paid_at)}`
                              : invoice.due_date
                                ? `Due ${formatDate(invoice.due_date)}`
                                : "No due date"}
                          </span>
                        </div>
                      }
                      action={
                        invoice.hosted_invoice_url ? (
                          <Link
                            href={invoice.hosted_invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={buttonVariants({ variant: "outline", size: "sm" })}
                          >
                            View
                          </Link>
                        ) : null
                      }
                    />
                  )}
                />

                <div className="hidden rounded-lg border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead>Links</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                    {invoiceList.rows.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-medium">
                            {invoice.invoice_number ?? invoice.stripe_invoice_id ?? invoice.id}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{invoiceStatusLabel(invoice.status)}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatMoney(invoice.total_amount, invoice.currency)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {invoice.period_start && invoice.period_end
                              ? `${formatDate(invoice.period_start)} → ${formatDate(invoice.period_end)}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {invoice.due_date
                              ? formatDate(invoice.due_date)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(invoice.paid_at)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              {invoice.hosted_invoice_url && (
                                <Link
                                  href={invoice.hosted_invoice_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={buttonVariants({ variant: "outline", size: "sm" })}
                                >
                                  View
                                </Link>
                              )}
                              {invoice.invoice_pdf_url && (
                                <Link
                                  href={invoice.invoice_pdf_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={buttonVariants({ variant: "outline", size: "sm" })}
                                >
                                  PDF
                                </Link>
                              )}
                            </div>
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

        <Card>
          <CardHeader>
            <CardTitle>Payment events</CardTitle>
            <CardDescription>
              Sanitized Stripe payment lifecycle events without raw payloads.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {paymentEventErrorState ? (
              <p className="text-sm text-destructive">
                {paymentEventErrorState.message}
              </p>
            ) : !hasPaymentEvents ? (
              <EmptyState
                title={
                  business.stripe_customer_id
                    ? "No payment events have synced yet"
                    : "Stripe customer not linked yet"
                }
                description={
                  business.stripe_customer_id
                    ? "Payment lifecycle rows will appear here after Stripe sends invoice or payment events."
                    : "Connect the business to a Stripe customer before payment events can appear."
                }
              />
            ) : (
              <>
                <MobileDataList
                  items={paymentEvents}
                  empty={null}
                  getKey={(event) => event.id}
                  renderItem={(event) => (
                    <MobileDataCard
                      title={event.event_type}
                      subtitle={event.provider_event_id ?? event.stripe_payment_intent_id ?? event.stripe_charge_id ?? "Stripe event"}
                      meta={
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{event.status}</Badge>
                          <span>{formatMoney(event.amount, event.currency)}</span>
                          <span>{formatDateTime(event.occurred_at)}</span>
                        </div>
                      }
                    />
                  )}
                />

                <div className="hidden rounded-lg border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Occurred</TableHead>
                        <TableHead>Invoice</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentEvents.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell className="font-medium">
                            {event.event_type}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{event.status}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatMoney(event.amount, event.currency)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDateTime(event.occurred_at)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {event.invoice_id ?? "—"}
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

        <Card>
          <CardHeader>
            <CardTitle>Subscription line items</CardTitle>
            <CardDescription>
              The products and quantities attached to the current subscription.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {current && current.items.length > 0 ? (
              <>
                <MobileDataList
                  items={current.items}
                  empty={null}
                  getKey={(item) => item.id}
                  renderItem={(item) => (
                    <MobileDataCard
                      title={item.product_key}
                      subtitle={item.stripe_price_id}
                      meta={<span>Quantity {item.quantity}</span>}
                    />
                  )}
                />

                <div className="hidden rounded-lg border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Stripe price</TableHead>
                        <TableHead className="text-end">Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {current.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.product_key}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {item.stripe_price_id}
                          </TableCell>
                          <TableCell className="text-end tabular-nums">{item.quantity}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <EmptyState
                title="No line items"
                description="The active subscription does not currently expose any line items."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
