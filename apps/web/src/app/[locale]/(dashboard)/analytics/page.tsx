import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { DetailSummaryCard } from "@/components/detail-summary-card";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { buttonVariants } from "@/components/ui/button";
import { requireMembership } from "@/lib/auth";
import type {
  BillingInvoiceSummaryRow,
  BillingRevenueSummary,
  PaginatedListResult,
} from "@/lib/billing-views";
import { canManageBusiness } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  summarizeBillingInvoices,
  summarizeBillingRevenueTrend,
} from "@/lib/billing-summary";
import { DateRange, withinDateRange } from "@/lib/filtering";
import type {
  Complaint,
  Customer,
  BusinessRating,
  Job,
  Quotation,
  Subscription,
} from "@/lib/database.types";
import { ACTIVE_JOB_STATUSES } from "@/lib/jobs";
import {
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_STATUS_VARIANT,
} from "@/lib/complaints";
import { summarizeRatings } from "@/lib/ratings";
import { QUOTE_STATUS_VARIANT } from "@/app/[locale]/(dashboard)/quotations/status";

type SubscriptionRow = Pick<
  Subscription,
  | "status"
  | "plan_key"
  | "current_period_start"
  | "current_period_end"
  | "cancel_at_period_end"
>;

type DashboardJobRow = Pick<
  Job,
  "id" | "title" | "status" | "created_at" | "updated_at" | "expected_completion_at"
>;

type DashboardQuoteRow = Pick<
  Quotation,
  "id" | "status" | "created_at" | "total" | "currency" | "updated_at"
>;

type DashboardComplaintRow = Pick<
  Complaint,
  "id" | "subject" | "status" | "severity" | "created_at" | "resolved_at" | "escalated_at"
>;

type DashboardCustomerRow = Pick<Customer, "created_at">;

const PERIOD_OPTIONS: Array<{ label: string; value: DateRange }> = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "All", value: "all" },
];

function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat("en", { month: "short" }).format(date);
}

function startOfMonth(date: Date) {
  const copy = new Date(date);
  copy.setDate(1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function monthSeries(months: number) {
  const base = startOfMonth(new Date());
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(base);
    date.setMonth(base.getMonth() - (months - index - 1));
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: monthLabel(date),
      date,
      value: 0,
    };
  });
}

function daySeries(days: number) {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(base);
    date.setDate(base.getDate() - (days - index - 1));
    return {
      key: date.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat("en", { weekday: "short" }).format(date),
      date,
      value: 0,
    };
  });
}

function toMonthKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function parsePeriod(value: string | string[] | undefined): DateRange {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "7d" || raw === "30d" || raw === "90d" || raw === "all") return raw;
  return "30d";
}

function periodText(period: DateRange) {
  switch (period) {
    case "7d":
      return "the last 7 days";
    case "30d":
      return "the last 30 days";
    case "90d":
      return "the last 90 days";
    default:
      return "all time";
  }
}

function formatMoney(value: number, currency: string) {
  return formatCurrency(value, currency);
}

function monthKeyFromIso(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function MetricCard({
  label,
  value,
  helper,
}: {
  helper: string;
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <span className="text-muted-foreground text-xs">{helper}</span>
      </CardContent>
    </Card>
  );
}

function StatusBars({
  title,
  description,
  rows,
}: {
  description: string;
  rows: { label: string; value: number; variant?: "default" | "secondary" | "outline" | "destructive" }[];
  title: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.length === 0 ? (
          <EmptyState
            title="No data yet"
            description="This section will populate once the business starts generating activity."
          />
        ) : (
          rows.map((row) => (
            <div key={row.label} className="grid gap-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{row.label}</span>
                <span className="text-muted-foreground tabular-nums">{row.value}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(row.value / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string }>;
}) {
  const { member, business } = await requireMembership();
  const supabase = await createClient();
  const canSeeBilling = canManageBusiness(member.role);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const period = parsePeriod(resolvedSearchParams?.period);
  const ratingT = await getTranslations("ratings");

  const [
    { data: customerRows, error: customerError },
    { data: jobRows, error: jobError },
    { data: quoteRows, error: quoteError },
    { data: complaintRows, error: complaintError },
    { data: ratingRows },
    { data: documentRows, error: documentError },
    { data: subscriptionRows, error: subscriptionError },
    { data: billingRevenueRowsData, error: billingRevenueRowsError },
    { data: invoiceListData, error: invoiceListError },
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("created_at")
      .eq("business_id", business.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("jobs")
      .select("id, title, status, created_at, updated_at, expected_completion_at")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("quotations")
      .select("id, status, created_at, total, currency, updated_at")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("complaints")
      .select("id, subject, status, severity, created_at, resolved_at, escalated_at")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("business_ratings")
      .select("rating")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("documents")
      .select("id, created_at")
      .eq("business_id", business.id),
    canSeeBilling
      ? supabase
          .from("subscriptions")
          .select(
            "status, plan_key, current_period_start, current_period_end, cancel_at_period_end",
          )
          .eq("business_id", business.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as SubscriptionRow[], error: null }),
    canSeeBilling
      ? supabase
          .from("billing_invoices")
          .select("currency, status, total_amount, amount_due, due_date, paid_at, created_at")
          .eq("business_id", business.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({
          data: [] as Array<
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
          >,
          error: null,
        }),
    canSeeBilling
      ? supabase.rpc("list_business_billing_invoices", {
          p_business_id: business.id,
          p_limit: 50,
          p_offset: 0,
        })
      : Promise.resolve({
          data: { rows: [], total_count: 0 } as unknown as PaginatedListResult<BillingInvoiceSummaryRow>,
          error: null,
        }),
  ]);

  const customers = (customerRows ?? []) as DashboardCustomerRow[];
  const jobs = (jobRows ?? []) as DashboardJobRow[];
  const quotes = (quoteRows ?? []) as DashboardQuoteRow[];
  const complaints = (complaintRows ?? []) as DashboardComplaintRow[];
  const documents = documentRows ?? [];
  const subscriptions = (subscriptionRows ?? []) as SubscriptionRow[];

  const periodCustomers = customers.filter((customer) =>
    withinDateRange(customer.created_at, period),
  );
  const periodJobs = jobs.filter((job) => withinDateRange(job.created_at, period));
  const periodQuotes = quotes.filter((quote) => withinDateRange(quote.created_at, period));
  const periodComplaints = complaints.filter((complaint) =>
    withinDateRange(complaint.created_at, period),
  );
  const periodDocuments = documents.filter((document) =>
    withinDateRange(document.created_at, period),
  );

  const newCustomersThisMonth = periodCustomers.length;

  const activeJobs = periodJobs.filter((job) => ACTIVE_JOB_STATUSES.includes(job.status));
  const completedJobs = periodJobs.filter((job) => job.status === "completed");
  const overdueJobs = periodJobs.filter((job) => {
    if (!job.expected_completion_at) return false;
    const due = new Date(job.expected_completion_at);
    return due < new Date() && !["completed", "cancelled"].includes(job.status);
  });

  const pendingQuotes = periodQuotes.filter((quote) => ["sent", "revised"].includes(quote.status));
  const approvedQuotes = periodQuotes.filter((quote) => quote.status === "approved");
  const rejectedQuotes = periodQuotes.filter((quote) => quote.status === "declined");

  const openComplaints = periodComplaints.filter(
    (complaint) => !["resolved", "closed"].includes(complaint.status),
  );
  const resolvedComplaints = periodComplaints.filter((complaint) =>
    ["resolved", "closed"].includes(complaint.status),
  );

  const currentSubscription = subscriptions[0] ?? null;
  const customerSeries = monthSeries(6).map((point) => ({
    ...point,
    value: periodCustomers.filter((customer) => toMonthKey(customer.created_at) === point.key).length,
  }));

  const quoteSeries = Object.entries(
    periodQuotes.reduce<Record<string, number>>((acc, quote) => {
      acc[quote.status] = (acc[quote.status] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([label, value]) => ({ label, value }));

  const complaintSeries = Object.entries(
    periodComplaints.reduce<Record<string, number>>((acc, complaint) => {
      acc[complaint.status] = (acc[complaint.status] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([label, value]) => ({
    label: COMPLAINT_STATUS_LABELS[label as keyof typeof COMPLAINT_STATUS_LABELS] ?? label,
    value,
  }));

  const jobSeries = Object.entries(
    periodJobs.reduce<Record<string, number>>((acc, job) => {
      acc[job.status] = (acc[job.status] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([label, value]) => ({ label, value }));

  const quoteTrendSeries = monthSeries(6).map((point) => ({
    label: point.label,
    value: periodQuotes.filter((quote) => toMonthKey(quote.created_at) === point.key).length,
  }));
  const jobTrendSeries = monthSeries(6).map((point) => ({
    label: point.label,
    value: periodJobs.filter((job) => toMonthKey(job.created_at) === point.key).length,
  }));
  const complaintTrendSeries = monthSeries(6).map((point) => ({
    label: point.label,
    value: periodComplaints.filter(
      (complaint) => toMonthKey(complaint.created_at) === point.key,
    ).length,
  }));
  const ratingSummary = summarizeRatings(
    (ratingRows ?? []) as Array<Pick<BusinessRating, "rating">>,
  );

  const recentJobs = periodJobs.slice(0, 5);
  const totalQuoteValue = periodQuotes.reduce((sum, quote) => sum + quote.total, 0);
  const approvedRate =
    periodQuotes.length > 0 ? Math.round((approvedQuotes.length / periodQuotes.length) * 100) : 0;
  const currentPeriodLabel = periodText(period);
  const billingRevenueRows =
    (billingRevenueRowsData ?? []) as Array<
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
  const revenueSummary = summarizeBillingInvoices(billingRevenueRows, period) as BillingRevenueSummary;
  const revenueTrendRows = summarizeBillingRevenueTrend(billingRevenueRows, period) as Array<{
    bucket_start: string;
    revenue: number;
    invoice_count: number;
    currency: string;
  }>;
  const invoiceList = (invoiceListData ?? {
    rows: [],
    total_count: 0,
  }) as unknown as PaginatedListResult<BillingInvoiceSummaryRow>;
  const hasInvoiceRows = invoiceList.rows.length > 0;
  const revenueCurrency = revenueSummary.currency ?? invoiceList.rows[0]?.currency ?? "AED";
  const revenueSyncReady = hasInvoiceRows;
  const revenueTrendSeries =
    period === "7d"
      ? daySeries(7).map((point) => ({
          label: point.label,
          value:
            revenueTrendRows.find(
              (row) => new Date(row.bucket_start).toISOString().slice(0, 10) === point.key,
            )?.revenue ?? 0,
        }))
      : monthSeries(6).map((point) => ({
          label: point.label,
          value:
            revenueTrendRows.find(
              (row) => monthKeyFromIso(row.bucket_start) === point.key,
            )?.revenue ?? 0,
        }));
  const paidInvoices = invoiceList.rows.filter((invoice) => invoice.status === "paid");
  const recentPaidInvoices = paidInvoices.slice(0, 5);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Tenant-scoped operational metrics, trends, and summaries."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {PERIOD_OPTIONS.map((option) => (
              <Link
                key={option.value}
                href={option.value === "all" ? "/analytics" : `/analytics?period=${option.value}`}
                className={cn(
                  buttonVariants({
                    variant: period === option.value ? "default" : "outline",
                    size: "sm",
                  }),
                )}
              >
                {option.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="flex flex-col gap-6 p-6">
        {(
          customerError ||
          jobError ||
          quoteError ||
          complaintError ||
          documentError ||
          subscriptionError ||
          billingRevenueRowsError ||
          invoiceListError
        ) && (
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="p-4 text-sm text-destructive">
              One or more analytics queries failed. The page is still showing the data that could be loaded.
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="Customers"
            value={periodCustomers.length}
            helper={
              currentPeriodLabel === "all time"
                ? `${newCustomersThisMonth} new overall`
                : `${newCustomersThisMonth} new in ${currentPeriodLabel}`
            }
          />
          <MetricCard
            label="Active jobs"
            value={activeJobs.length}
            helper={
              currentPeriodLabel === "all time"
                ? `${completedJobs.length} completed overall`
                : `${completedJobs.length} completed in ${currentPeriodLabel}`
            }
          />
          <MetricCard label="Overdue jobs" value={overdueJobs.length} helper="Due dates in the past" />
          <MetricCard
            label="Quotations"
            value={periodQuotes.length}
            helper={
              currentPeriodLabel === "all time"
                ? `${pendingQuotes.length} pending overall`
                : `${pendingQuotes.length} pending in ${currentPeriodLabel}`
            }
          />
          <MetricCard
            label="Complaints"
            value={periodComplaints.length}
            helper={
              currentPeriodLabel === "all time"
                ? `${openComplaints.length} open overall`
                : `${openComplaints.length} open in ${currentPeriodLabel}`
            }
          />
          <MetricCard
            label="Documents"
            value={periodDocuments.length}
            helper="Linked records and uploads"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="Pending quotes" value={pendingQuotes.length} helper="Sent or revised" />
          <MetricCard
            label="Approved quotes"
            value={approvedQuotes.length}
            helper={`${approvedRate}% approval rate`}
          />
          <MetricCard label="Rejected quotes" value={rejectedQuotes.length} helper="Customer declines" />
          <MetricCard label="Resolved complaints" value={resolvedComplaints.length} helper="Resolved or closed" />
          <MetricCard
            label="Plan"
            value={currentSubscription?.plan_key ?? "Unavailable"}
            helper={
              currentSubscription?.status
                ? `Status: ${currentSubscription.status}`
                : "Billing data only available to owners"
            }
          />
          <MetricCard
            label="Quote value"
            value={formatCurrency(totalQuoteValue, periodQuotes[0]?.currency ?? "AED")}
            helper={
              currentPeriodLabel === "all time"
                ? "Total value overall"
                : `Total value in ${currentPeriodLabel}`
            }
          />
          <MetricCard
            label="Paid revenue"
            value={
              revenueSyncReady
                ? formatMoney(revenueSummary.total_paid_revenue ?? 0, revenueCurrency)
                : "—"
            }
            helper={
              revenueSyncReady
                ? `Paid invoices in ${currentPeriodLabel}`
                : "Revenue will populate after Stripe invoices sync"
            }
          />
          <MetricCard
            label="Open invoice amount"
            value={
              revenueSyncReady
                ? formatMoney(revenueSummary.open_invoice_amount ?? 0, revenueCurrency)
                : "—"
            }
            helper={revenueSyncReady ? "Outstanding balance" : "Awaiting invoice sync"}
          />
          <MetricCard
            label="Open invoices"
            value={revenueSyncReady ? revenueSummary.open_invoices_count ?? 0 : "—"}
            helper={revenueSyncReady ? "Awaiting payment or review" : "Awaiting invoice sync"}
          />
          <MetricCard
            label="Average invoice"
            value={
              revenueSyncReady
                ? formatMoney(revenueSummary.average_invoice_value ?? 0, revenueCurrency)
                : "—"
            }
            helper={revenueSyncReady ? "Paid invoices only" : "Awaiting invoice sync"}
          />
          <MetricCard
            label={ratingT("summary.title")}
            value={
              ratingSummary.count > 0
                ? `${ratingSummary.roundedAverage.toFixed(1)} / 5`
                : "—"
            }
            helper={
              ratingSummary.count > 0
                ? ratingT("summary.helper", { count: ratingSummary.count })
                : ratingT("summary.empty")
            }
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <DetailSummaryCard
            title="Recent jobs"
            description="The latest work orders and their current state."
            rows={
              recentJobs.length === 0
                ? [
                    {
                      label: "Jobs",
                      value: "No jobs yet",
                      note: "Jobs will appear once work orders are created.",
                    },
                  ]
                : recentJobs.map((job) => ({
                    label: job.title,
                    value: (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{job.status}</Badge>
                        <span className="text-muted-foreground">
                          {job.expected_completion_at
                            ? `Due ${new Date(job.expected_completion_at).toLocaleDateString()}`
                            : "No due date"}
                        </span>
                      </div>
                    ),
                    note: `Updated ${new Date(job.updated_at).toLocaleDateString()}`,
                  }))
            }
          />

          <StatusBars
            title="Quote performance"
            description="Status distribution for quotations on this business."
            rows={quoteSeries.map((row) => ({
              label: row.label,
              value: row.value,
              variant:
                QUOTE_STATUS_VARIANT[row.label as keyof typeof QUOTE_STATUS_VARIANT] ?? "outline",
            }))}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <StatusBars
            title="Complaint workload"
            description="Current complaint status mix across the business."
            rows={complaintSeries.map((row) => ({
              label: row.label,
              value: row.value,
              variant:
                COMPLAINT_STATUS_VARIANT[row.label as keyof typeof COMPLAINT_STATUS_VARIANT] ?? "outline",
            }))}
          />

          <StatusBars
            title="Job status"
            description="Active, completed, and delayed work orders."
            rows={jobSeries.map((row) => ({
              label: row.label,
              value: row.value,
            }))}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <StatusBars
            title="Customer trend"
            description={`Monthly customer additions over ${currentPeriodLabel}.`}
            rows={customerSeries.map((point) => ({ label: point.label, value: point.value }))}
          />
          <StatusBars
            title="Quote trend"
            description={`Monthly quote creation over ${currentPeriodLabel}.`}
            rows={quoteTrendSeries}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <StatusBars
            title="Job trend"
            description={`Monthly job creation over ${currentPeriodLabel}.`}
            rows={jobTrendSeries}
          />
          <StatusBars
            title="Complaint trend"
            description={`Monthly complaint creation over ${currentPeriodLabel}.`}
            rows={complaintTrendSeries}
          />
        </div>

        {canSeeBilling ? (
          hasInvoiceRows ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <StatusBars
                title="Revenue trend"
                description={`Invoice revenue over ${currentPeriodLabel}.`}
                rows={revenueTrendSeries}
              />

              <Card>
                <CardHeader>
                  <CardTitle>Recent paid invoices</CardTitle>
                  <CardDescription>
                    The latest synced invoices that have been paid successfully.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {paidInvoices.length === 0 ? (
                    <EmptyState
                      title="No paid invoices yet"
                      description="Invoices exist, but none have been marked paid yet."
                    />
                  ) : (
                    <MobileDataList
                      items={recentPaidInvoices}
                      empty={null}
                      getKey={(invoice) => invoice.id}
                      renderItem={(invoice) => (
                        <MobileDataCard
                          title={invoice.invoice_number ?? invoice.stripe_invoice_id ?? invoice.id}
                          subtitle={invoice.subscription_plan_key ?? "Invoice"}
                          meta={
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">Paid</Badge>
                              <span>{formatMoney(invoice.total_amount, invoice.currency)}</span>
                              <span>{new Date(invoice.paid_at ?? invoice.created_at).toLocaleDateString()}</span>
                            </div>
                          }
                        />
                      )}
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Revenue analytics</CardTitle>
                <CardDescription>
                  Revenue will populate after Stripe invoices sync into Revora.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EmptyState
                  title="No invoice sync yet"
                  description="Stripe is connected, but no invoice rows have arrived yet. Once webhook events land, revenue trends will appear here."
                />
              </CardContent>
            </Card>
          )
        ) : null}
      </div>
    </>
  );
}
