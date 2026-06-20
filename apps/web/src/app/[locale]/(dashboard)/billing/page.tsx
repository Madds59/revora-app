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
import { getLocale } from "next-intl/server";
import { canManageBusiness } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { summarizeBillingInvoices } from "@/lib/billing-summary";
import {
  getBillingInvoiceStatusLabel,
  getBillingLimitUnitLabel,
  getBillingPlanLabel,
  getBillingFeatureLabel,
  getCommonLabel,
} from "@/lib/display-labels";
import { formatCurrency as formatLocalizedCurrency } from "@/lib/formatters";
import type { Subscription, SubscriptionItem } from "@/lib/database.types";

type SubscriptionView = Subscription & {
  items: SubscriptionItem[];
};

function formatEntitlement(value: unknown, locale: "en" | "ar") {
  if (typeof value === "boolean") {
    return value ? getCommonLabel("enabled", locale) : getCommonLabel("disabled", locale);
  }
  if (typeof value === "number") return formatNumber(value, undefined, locale);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return getCommonLabel("unavailable", locale);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function formatMoney(value: number, currency: string, locale: "en" | "ar") {
  return formatLocalizedCurrency(value, currency, undefined, locale);
}

function formatPrice(amount: number | null, currency: string, locale: "en" | "ar") {
  if (amount == null) return getCommonLabel("configuredInStripe", locale);
  return formatMoney(amount / 100, currency, locale);
}

function featureValue(feature: BillingPlanCatalogRow["features"][number], locale: "en" | "ar") {
  if (!feature.included) return getCommonLabel("notIncluded", locale);
  if (feature.limit_value == null) return getCommonLabel("included", locale);
  return `${formatNumber(feature.limit_value, undefined, locale)}${
    feature.limit_unit ? ` ${getBillingLimitUnitLabel(feature.limit_unit, locale)}` : ""
  }`;
}

function invoiceStatusLabel(status: string, locale: "en" | "ar") {
  return getBillingInvoiceStatusLabel(
    status as Parameters<typeof getBillingInvoiceStatusLabel>[0],
    locale,
  );
}

function subscriptionStatusLabel(status: string, locale: "en" | "ar") {
  const labels =
    locale === "ar"
      ? {
          active: "نشط",
          trialing: "فترة تجريبية",
          canceled: "ملغي",
          past_due: "متأخر",
          unpaid: "غير مدفوع",
          paused: "متوقف",
          incomplete: "غير مكتمل",
        }
      : {
          active: "Active",
          trialing: "Trialing",
          canceled: "Canceled",
          past_due: "Past due",
          unpaid: "Unpaid",
          paused: "Paused",
          incomplete: "Incomplete",
        };
  return labels[status as keyof typeof labels] ?? status;
}

function currentPlanInterval(
  subscription: SubscriptionView | undefined,
  plan: BillingPlanCatalogRow | null | undefined,
  locale: "en" | "ar",
) {
  if (!subscription || !plan) return getCommonLabel("unavailable", locale);
  const priceIds = new Set(subscription.items.map((item: SubscriptionItem) => item.stripe_price_id));
  if (plan.stripe_price_id_monthly && priceIds.has(plan.stripe_price_id_monthly)) {
    return locale === "ar" ? "شهري" : "Monthly";
  }
  if (plan.stripe_price_id_yearly && priceIds.has(plan.stripe_price_id_yearly)) {
    return locale === "ar" ? "سنوي" : "Yearly";
  }
  return getCommonLabel("unknown", locale);
}

function billingPlanLabel(plan: BillingPlanCatalogRow | null | undefined, locale: "en" | "ar") {
  if (!plan) return getCommonLabel("unavailable", locale);
  return getBillingPlanLabel(plan.slug ?? plan.name, locale);
}

function billingFeatureLabel(value: string, locale: "en" | "ar") {
  return getBillingFeatureLabel(value, locale) ?? value;
}

function invoiceSubtitle(value: string | null | undefined, locale: "en" | "ar") {
  if (!value) return locale === "ar" ? "فاتورة" : "Invoice";
  return getBillingPlanLabel(value, locale);
}

export default async function BillingPage() {
  const locale = await getLocale();
  const { member, business } = await requireMembership();
  if (!canManageBusiness(member.role)) {
    return (
      <>
        <PageHeader
          title={locale === "ar" ? "الفوترة" : "Billing"}
          description={
            locale === "ar"
              ? "سجل الاشتراكات والفواتير."
              : "Subscription and invoice history."
          }
        />
        <div className="p-6">
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              {locale === "ar"
                ? "الفوترة متاحة لمالكي النشاط فقط."
                : "Billing is available to business owners only."}
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
  (itemRows ?? []).forEach((item: SubscriptionItem) => {
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
    { data: billingInvoiceRowsData, error: billingInvoiceRowsError },
    { data: paymentEventRows, error: paymentEventError },
  ] = await Promise.all([
    supabase.rpc("list_active_billing_plans"),
    supabase.rpc("list_business_billing_invoices", {
      p_business_id: business.id,
      p_limit: 25,
      p_offset: 0,
    }),
    supabase
      .from("billing_invoices")
      .select(
        "currency, status, total_amount, amount_due, due_date, paid_at, created_at",
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false }),
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
  const billingRevenueRows =
    (billingInvoiceRowsData ?? []) as Array<
      Pick<
        BillingInvoiceSummaryRow,
        | "currency"
        | "status"
        | "total_amount"
        | "amount_due"
        | "due_date"
        | "paid_at"
        | "created_at"
      >
    >;
  const revenueSummary = summarizeBillingInvoices(billingRevenueRows, "90d") as BillingRevenueSummary;

  const currentPlan = plans.find((plan) => plan.slug.toLowerCase() === currentPlanSlug) ?? null;
  const currentInterval = currentPlanInterval(current, currentPlan, locale);
  const planFeatureKeys = Array.from(
    new Set(plans.flatMap((plan) => plan.features.map((feature) => feature.feature_key))),
  );
  const entitlementRecord = asRecord(current?.entitlements);
  const hasInvoiceRows = invoiceList.rows.length > 0;
  const hasPaymentEvents = paymentEvents.length > 0;
  const revenueErrorState = planError ?? invoiceError ?? billingInvoiceRowsError ?? null;
  const paymentEventErrorState = paymentEventError ?? null;
  const billingSyncState = business.stripe_customer_id
    ? hasInvoiceRows
      ? locale === "ar"
        ? "تم ربط Stripe وبدأت الفواتير بالمزامنة."
        : "Stripe is connected and invoices have started syncing."
      : locale === "ar"
        ? "تم الاتصال بـ Stripe، بانتظار مزامنة الفواتير."
        : "Connected to Stripe, awaiting invoice sync."
    : locale === "ar"
      ? "عميل Stripe غير مرتبط بعد."
      : "Stripe customer not linked yet.";

  return (
    <>
      <PageHeader
        title={locale === "ar" ? "الفوترة" : "Billing"}
        description={
          locale === "ar"
            ? "سجل الاشتراكات والخطط والفواتير."
            : "Subscription, plan, and invoice history."
        }
        action={
          <Link href="/settings/business" className={buttonVariants({ variant: "outline" })}>
            {locale === "ar" ? "إعدادات النشاط" : "Business settings"}
          </Link>
        }
      />
      <div className="flex flex-col gap-6 p-6">
        {(error || revenueErrorState) && (
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="p-4 text-sm text-destructive">
              {locale === "ar"
                ? "تعذّر تحميل بعض بيانات الفوترة. لا تزال الصفحة تعرض ما أمكن تحميله."
                : "Billing data partially failed to load. The page is still showing whatever could be loaded."}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{locale === "ar" ? "إجراءات بوابة الفوترة" : "Billing portal actions"}</CardTitle>
            <CardDescription>
              {locale === "ar"
                ? "افتح بوابة عملاء Stripe لهذا النشاط أو تواصل مع الدعم إذا لم يربط المستأجر بعد."
                : "Open the Stripe customer portal for this business or fall back to support if the tenant has not been linked yet."}
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
                {locale === "ar" ? "طلب الوصول إلى البوابة" : "Request portal access"}
              </Link>
            )}
            <Link
              href="/settings/business"
              className={buttonVariants({ variant: "outline" })}
            >
              {locale === "ar" ? "إعدادات النشاط" : "Business settings"}
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{locale === "ar" ? "حالة المزامنة" : "Billing sync state"}</CardTitle>
            <CardDescription>{billingSyncState}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant={business.stripe_customer_id ? "default" : "outline"}>
            {business.stripe_customer_id ? (locale === "ar" ? "Stripe مرتبط" : "Stripe linked") : (locale === "ar" ? "Stripe غير مرتبط" : "Stripe unlinked")}
          </Badge>
            <Badge variant={hasInvoiceRows ? "default" : "outline"}>
              {hasInvoiceRows ? (locale === "ar" ? "تمت مزامنة الفواتير" : "Invoices synced") : (locale === "ar" ? "بانتظار الفواتير" : "Awaiting invoices")}
            </Badge>
            <Badge variant={hasPaymentEvents ? "default" : "outline"}>
              {hasPaymentEvents ? (locale === "ar" ? "تمت مزامنة المدفوعات" : "Payments synced") : (locale === "ar" ? "بانتظار المدفوعات" : "Awaiting payments")}
            </Badge>
          </CardContent>
        </Card>

        {current && (
          <DetailSummaryCard
            title={locale === "ar" ? "الاشتراك الحالي" : "Current subscription"}
            description={locale === "ar" ? "حالة الخطة، ونافذة التجديد، وإمكانية الوصول للفوترة." : "Plan state, renewal window, and billing access."}
            rows={[
              { label: locale === "ar" ? "الخطة" : "Plan", value: billingPlanLabel(currentPlan, locale) },
              { label: locale === "ar" ? "الحالة" : "Status", value: subscriptionStatusLabel(current.status, locale) },
              { label: locale === "ar" ? "الدورية" : "Billing interval", value: currentInterval },
              {
                label: locale === "ar" ? "الفترة الحالية" : "Current period",
                value: current.current_period_end
                  ? `${current.current_period_start ? formatDate(current.current_period_start, undefined, locale) : getCommonLabel("none", locale)} → ${formatDate(current.current_period_end, undefined, locale)}`
                  : getCommonLabel("unavailable", locale),
              },
              {
                label: locale === "ar" ? "التجديد" : "Renewal",
                value: current.current_period_end ? formatDate(current.current_period_end, undefined, locale) : getCommonLabel("unavailable", locale),
              },
              {
                label: locale === "ar" ? "التجديد التلقائي" : "Auto-renew",
                value: current.cancel_at_period_end ? getCommonLabel("disabled", locale) : getCommonLabel("enabled", locale),
              },
              {
                label: locale === "ar" ? "عميل Stripe" : "Stripe customer",
                value: business.stripe_customer_id ? (locale === "ar" ? "مرتبط" : "Linked") : getCommonLabel("unavailable", locale),
              },
            ]}
            status={{ label: subscriptionStatusLabel(current.status, locale) }}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{locale === "ar" ? "الإيراد المدفوع" : "Paid revenue"}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {formatMoney(revenueSummary?.total_paid_revenue ?? 0, revenueSummary?.currency ?? "AED", locale)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-muted-foreground text-xs">
                {locale === "ar" ? "آخر 90 يومًا" : "Last 90 days"}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{locale === "ar" ? "إجمالي الفواتير المفتوحة" : "Open invoice amount"}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {formatMoney(revenueSummary?.open_invoice_amount ?? 0, revenueSummary?.currency ?? "AED", locale)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-muted-foreground text-xs">
                {locale === "ar" ? "الرصيد المستحق" : "Outstanding balance"}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{locale === "ar" ? "متوسط الفاتورة" : "Average invoice"}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {formatMoney(revenueSummary?.average_invoice_value ?? 0, revenueSummary?.currency ?? "AED", locale)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-muted-foreground text-xs">
                {locale === "ar" ? "الفواتير المدفوعة فقط" : "Paid invoices only"}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{locale === "ar" ? "الفواتير المدفوعة" : "Paid invoices"}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {revenueSummary?.paid_invoices_count ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{locale === "ar" ? "الفواتير المفتوحة" : "Open invoices"}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {revenueSummary?.open_invoices_count ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{locale === "ar" ? "المتأخرة / المستحقة" : "Overdue / due"}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {revenueSummary?.overdue_or_due_invoices_count ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{locale === "ar" ? "استحقاقات الخطة" : "Plan entitlements"}</CardTitle>
            <CardDescription>
              {locale === "ar"
                ? "تظهر استحقاقات المزايا مباشرة من بيانات الاشتراك الحالية."
                : "Feature entitlements are shown directly from the current subscription metadata."}
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
                    <div className="mt-1 text-sm">{formatEntitlement(value, locale)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title={locale === "ar" ? "لا توجد استحقاقات معروضة" : "No entitlements exposed"}
                description={
                  locale === "ar"
                    ? "الاشتراك الحالي لا يعرض مصفوفة مزايا بعد."
                    : "The current subscription does not expose a feature matrix yet."
                }
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{locale === "ar" ? "مقارنة الخطط" : "Plan comparison"}</CardTitle>
            <CardDescription>
              {locale === "ar"
                ? "كتالوج خطط قائم على البيانات يأتي من الواجهة الخلفية للفوترة."
                : "Data-driven plan catalog seeded from the billing backend."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {plans.length === 0 ? (
              <EmptyState
                title={locale === "ar" ? "كتالوج الخطط غير متاح" : "Plan catalog unavailable"}
                description={
                  locale === "ar"
                    ? "لم يتم إرجاع أي خطط نشطة من كتالوج الفوترة."
                    : "No active plans were returned from the billing catalog."
                }
              />
            ) : (
              <>
                <MobileDataList
                  items={plans}
                  empty={null}
                  getKey={(plan) => plan.id}
                  renderItem={(plan) => (
                    <MobileDataCard
                      title={billingPlanLabel(plan, locale)}
                      subtitle={plan.description ?? (locale === "ar" ? "لا يوجد وصف" : "No description")}
                      meta={
                        <div className="flex flex-wrap gap-2">
                          {plan.slug.toLowerCase() === currentPlanSlug && (
                            <Badge variant="default">{locale === "ar" ? "الحالية" : "Current"}</Badge>
                          )}
                        </div>
                      }
                    >
                      <div className="grid gap-2 text-xs text-muted-foreground">
                        <div>
                          {locale === "ar" ? "شهريًا" : "Monthly"}: {formatPrice(plan.monthly_amount, plan.currency, locale)}
                        </div>
                        <div>
                          {locale === "ar" ? "سنويًا" : "Yearly"}: {formatPrice(plan.yearly_amount, plan.currency, locale)}
                        </div>
                        <div className="grid gap-1">
                          {plan.features.slice(0, 4).map((feature) => (
                            <div key={feature.id} className="flex items-center justify-between gap-2">
                              <span>{billingFeatureLabel(feature.feature_key ?? feature.feature_name, locale)}</span>
                              <span className="font-medium text-foreground">
                                {featureValue(feature, locale)}
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
                        <TableHead>{locale === "ar" ? "الميزة" : "Feature"}</TableHead>
                        {plans.map((plan) => (
                          <TableHead key={plan.id} className="align-top">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">{billingPlanLabel(plan, locale)}</span>
                              <span className="text-muted-foreground text-xs">
                                {formatPrice(plan.monthly_amount, plan.currency, locale)}
                              </span>
                              {plan.slug.toLowerCase() === currentPlanSlug && (
                                <Badge variant="default" className="w-fit">
                                  {locale === "ar" ? "الحالية" : "Current"}
                                </Badge>
                              )}
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {planFeatureKeys.map((featureKey) => {
                        return (
                          <TableRow key={featureKey}>
                            <TableCell className="font-medium">{billingFeatureLabel(featureKey, locale)}</TableCell>
                            {plans.map((plan) => {
                              const feature = plan.features.find(
                                (item) => item.feature_key === featureKey,
                              );
                              return (
                                <TableCell key={plan.id} className="text-muted-foreground">
                                  {feature ? featureValue(feature, locale) : getCommonLabel("notIncluded", locale)}
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
            <CardTitle>{locale === "ar" ? "سجل الفواتير" : "Invoice history"}</CardTitle>
            <CardDescription>
              {locale === "ar"
                ? "ستظهر الفواتير الحقيقية هنا بمجرد أن تحتوي مزامنة الفوترة على بيانات."
                : "Real invoices will appear here once the billing sync has data."}
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
                    ? locale === "ar"
                      ? "لم تتم مزامنة أي فواتير بعد"
                      : "No invoices have synced yet"
                    : locale === "ar"
                      ? "عميل Stripe غير مرتبط بعد"
                      : "Stripe customer not linked yet"
                }
                description={
                  business.stripe_customer_id
                    ? locale === "ar"
                      ? "تم الاتصال بـ Stripe. ستظهر صفوف الفواتير بعد وصول أحداث webhook."
                      : "Stripe is connected. Invoice rows will appear after webhook events are received."
                    : locale === "ar"
                      ? "اربط النشاط بعميل Stripe قبل أن يظهر سجل الفواتير."
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
                      subtitle={invoiceSubtitle(invoice.subscription_plan_key, locale)}
                      meta={
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{invoiceStatusLabel(invoice.status, locale)}</Badge>
                          <span>
                            {formatMoney(invoice.total_amount, invoice.currency, locale)}
                          </span>
                          <span>
                            {invoice.paid_at
                              ? `${locale === "ar" ? "مدفوعة" : "Paid"} ${formatDate(invoice.paid_at, undefined, locale)}`
                              : invoice.due_date
                                ? `${locale === "ar" ? "مستحقة" : "Due"} ${formatDate(invoice.due_date, undefined, locale)}`
                                : locale === "ar"
                                  ? "لا يوجد تاريخ استحقاق"
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
                            {locale === "ar" ? "عرض" : "View"}
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
                        <TableHead>{locale === "ar" ? "الفاتورة" : "Invoice"}</TableHead>
                        <TableHead>{locale === "ar" ? "الحالة" : "Status"}</TableHead>
                        <TableHead>{locale === "ar" ? "المبلغ" : "Amount"}</TableHead>
                        <TableHead>{locale === "ar" ? "الفترة" : "Period"}</TableHead>
                        <TableHead>{locale === "ar" ? "الاستحقاق" : "Due"}</TableHead>
                        <TableHead>{locale === "ar" ? "المدفوع" : "Paid"}</TableHead>
                        <TableHead>{locale === "ar" ? "الروابط" : "Links"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                    {invoiceList.rows.map((invoice) => (
                        <TableRow key={invoice.id}>
                        <TableCell className="font-medium">
                          {invoice.invoice_number ?? invoice.stripe_invoice_id ?? invoice.id}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{invoiceStatusLabel(invoice.status, locale)}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatMoney(invoice.total_amount, invoice.currency, locale)}
                        </TableCell>
                          <TableCell className="text-muted-foreground">
                            {invoice.period_start && invoice.period_end
                              ? `${formatDate(invoice.period_start, undefined, locale)} → ${formatDate(invoice.period_end, undefined, locale)}`
                              : getCommonLabel("none", locale)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {invoice.due_date
                              ? formatDate(invoice.due_date, undefined, locale)
                              : getCommonLabel("none", locale)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(invoice.paid_at, undefined, locale)}
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
                                  {locale === "ar" ? "عرض" : "View"}
                                </Link>
                              )}
                              {invoice.invoice_pdf_url && (
                                <Link
                                  href={invoice.invoice_pdf_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={buttonVariants({ variant: "outline", size: "sm" })}
                                >
                                  {locale === "ar" ? "PDF" : "PDF"}
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
            <CardTitle>{locale === "ar" ? "أحداث الدفع" : "Payment events"}</CardTitle>
            <CardDescription>
              {locale === "ar"
                ? "أحداث دورة حياة الدفع من Stripe بعد تنقيح الحمولة الخام."
                : "Sanitized Stripe payment lifecycle events without raw payloads."}
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
                    ? locale === "ar"
                      ? "لم تتم مزامنة أي أحداث دفع بعد"
                      : "No payment events have synced yet"
                    : locale === "ar"
                      ? "عميل Stripe غير مرتبط بعد"
                      : "Stripe customer not linked yet"
                }
                description={
                  business.stripe_customer_id
                    ? locale === "ar"
                      ? "ستظهر صفوف دورة حياة الدفع هنا بعد أن يرسل Stripe أحداث الفواتير أو المدفوعات."
                      : "Payment lifecycle rows will appear here after Stripe sends invoice or payment events."
                    : locale === "ar"
                      ? "اربط النشاط بعميل Stripe قبل أن تظهر أحداث الدفع."
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
                          <span dir="ltr">{formatMoney(event.amount, event.currency, locale)}</span>
                          <span>{formatDateTime(event.occurred_at, undefined, locale)}</span>
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
                            {formatMoney(event.amount, event.currency, locale)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDateTime(event.occurred_at, undefined, locale)}
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
            <CardTitle>{locale === "ar" ? "بنود الاشتراك" : "Subscription line items"}</CardTitle>
            <CardDescription>
              {locale === "ar"
                ? "المنتجات والكميات المرتبطة بالاشتراك الحالي."
                : "The products and quantities attached to the current subscription."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {current && current.items.length > 0 ? (
              <>
                <MobileDataList
                  items={current.items as SubscriptionItem[]}
                  empty={null}
                  getKey={(item) => item.id}
                  renderItem={(item) => (
                    <MobileDataCard
                      title={getBillingPlanLabel(item.product_key, locale)}
                      subtitle={item.stripe_price_id}
                      meta={
                        <span>
                          {locale === "ar" ? "الكمية" : "Quantity"}{" "}
                          <span dir="ltr">{item.quantity}</span>
                        </span>
                      }
                    />
                  )}
                />

                <div className="hidden rounded-lg border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{locale === "ar" ? "البند" : "Item"}</TableHead>
                        <TableHead>{locale === "ar" ? "سعر Stripe" : "Stripe price"}</TableHead>
                        <TableHead className="text-end">{locale === "ar" ? "الكمية" : "Qty"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {current.items.map((item: SubscriptionItem) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            {getBillingPlanLabel(item.product_key, locale)}
                          </TableCell>
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
                title={locale === "ar" ? "لا توجد بنود" : "No line items"}
                description={
                  locale === "ar"
                    ? "الاشتراك الحالي لا يعرض أي بنود في الوقت الحالي."
                    : "The active subscription does not currently expose any line items."
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
