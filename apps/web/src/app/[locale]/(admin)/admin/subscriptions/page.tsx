import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PaginationControls } from "@/components/pagination-controls";
import { requireSuperAdmin } from "@/lib/auth";
import type {
  AdminSubscriptionFilteredRow,
  PaginatedListResult,
} from "@/lib/admin-views";
import { parsePageParam } from "@/lib/filtering";
import { createClient } from "@/lib/supabase/server";
import { AdminSubscriptionsBrowser } from "./subscriptions-browser";

function buildHref(
  page: number,
  pageSize: number,
  search = "",
  plan = "",
  status = "",
  interval = "",
  date = "",
  from = "",
  to = "",
) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (plan) params.set("plan", plan);
  if (status) params.set("status", status);
  if (interval) params.set("interval", interval);
  if (date) params.set("date", date);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (page > 1) params.set("page", String(page));
  if (pageSize !== 25) params.set("pageSize", String(pageSize));
  const query = params.toString();
  return query ? `/admin/subscriptions?${query}` : "/admin/subscriptions";
}

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    date?: string;
    from?: string;
    interval?: string;
    page?: string;
    pageSize?: string;
    plan?: string;
    q?: string;
    status?: string;
    to?: string;
  }>;
}) {
  await requireSuperAdmin();
  const supabase = await createClient();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const page = parsePageParam(resolvedSearchParams?.page, 1);
  const pageSize = Number(resolvedSearchParams?.pageSize ?? 25) || 25;
  const search = resolvedSearchParams?.q ?? "";
  const plan = resolvedSearchParams?.plan ?? "";
  const status = resolvedSearchParams?.status ?? "";
  const interval = resolvedSearchParams?.interval ?? "";
  const date = resolvedSearchParams?.date ?? "";
  const from = resolvedSearchParams?.from ?? null;
  const to = resolvedSearchParams?.to ?? null;

  const { data, error } = await supabase.rpc("admin_list_subscriptions_filtered", {
    p_search: search || undefined,
    p_plan: plan || undefined,
    p_status: status || undefined,
    p_interval: interval || undefined,
    p_from: from || undefined,
    p_to: to || undefined,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  const result = (data ?? null) as unknown as PaginatedListResult<AdminSubscriptionFilteredRow> | null;
  const subscriptions = result?.rows ?? [];
  const totalCount = result?.total_count ?? subscriptions.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  const active = subscriptions.filter((sub) => sub.status === "active").length;
  const trialing = subscriptions.filter((sub) => sub.status === "trialing").length;
  const overdue = subscriptions.filter((sub) => sub.status === "past_due").length;

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Platform subscription rollup across tenants."
      />
      <div className="flex flex-col gap-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{active}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Trialing</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{trialing}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Past due</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{overdue}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {subscriptions.length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Subscription overview ({totalCount})</CardTitle>
            <CardDescription>Stripe-backed tenants and their current plan state.</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-sm text-destructive">{error.message}</p>
            ) : subscriptions.length === 0 ? (
              <EmptyState
                title="No subscriptions yet"
                description="Stripe-backed subscription records will appear here once tenants are billed."
              />
            ) : (
              <AdminSubscriptionsBrowser
                subscriptions={subscriptions}
                totalCount={totalCount}
                footer={
                  pageCount > 1 ? (
                    <PaginationControls
                      page={page}
                      pageCount={pageCount}
                      totalCount={totalCount}
                      previousHref={
                        page > 1
                          ? buildHref(
                              page - 1,
                              pageSize,
                              search,
                              plan,
                              status,
                              interval,
                              date,
                              from ?? "",
                              to ?? "",
                            )
                          : null
                      }
                      nextHref={
                        page < pageCount
                          ? buildHref(
                              page + 1,
                              pageSize,
                              search,
                              plan,
                              status,
                              interval,
                              date,
                              from ?? "",
                              to ?? "",
                            )
                          : null
                      }
                    />
                  ) : null
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
