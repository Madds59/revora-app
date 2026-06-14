"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { FilterToolbar } from "@/components/filter-toolbar";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DateRange,
  dateRangeToBounds,
  matchesQuery,
  updateSearchParams,
  withinDateRange,
} from "@/lib/filtering";
import type { AdminSubscriptionRow } from "@/lib/admin-views";

const DATE_OPTIONS = [
  { label: "All time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "Last year", value: "1y" },
];

const STATUS_OPTIONS = [
  { label: "All statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Trialing", value: "trialing" },
  { label: "Past due", value: "past_due" },
  { label: "Canceled", value: "canceled" },
  { label: "Unpaid", value: "unpaid" },
  { label: "Incomplete", value: "incomplete" },
];

export function AdminSubscriptionsBrowser({
  footer,
  subscriptions,
  totalCount,
}: {
  footer?: ReactNode;
  subscriptions: AdminSubscriptionRow[];
  totalCount?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "all");
  const [dateRange, setDateRange] = useState<DateRange>(
    (searchParams.get("date") as DateRange | null) ?? "all",
  );

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
    setStatus(searchParams.get("status") ?? "all");
    setDateRange((searchParams.get("date") as DateRange | null) ?? "all");
  }, [searchParams]);

  function pushQuery(updates: Record<string, string | null | undefined>) {
    const next = updateSearchParams(new URLSearchParams(searchParams.toString()), updates);
    const href = next.toString() ? `${pathname}?${next.toString()}` : pathname;
    router.replace(href, { scroll: false });
  }

  const filtered = useMemo(() => {
    return subscriptions.filter((subscription) => {
      const matchesSearch = matchesQuery(
        [subscription.business_name, subscription.plan_key, subscription.status],
        search,
      );
      const matchesStatus = status === "all" || subscription.status === status;
      const matchesDate = withinDateRange(
        subscription.current_period_end ?? subscription.created_at,
        dateRange,
      );
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [dateRange, search, status, subscriptions]);

  return (
    <div className="flex flex-col gap-6">
      <FilterToolbar
        searchPlaceholder="Search business or plan"
        searchValue={search}
        onSearchValueChange={(value) => {
          setSearch(value);
          pushQuery({ q: value || null, page: null });
        }}
        statusValue={status}
        onStatusValueChange={(value) => {
          setStatus(value);
          pushQuery({ status: value === "all" ? null : value, page: null });
        }}
        statusOptions={STATUS_OPTIONS}
        dateValue={dateRange}
        onDateValueChange={(value) => {
          const next = value as DateRange;
          setDateRange(next);
          const bounds = dateRangeToBounds(next);
          pushQuery({
            date: next === "all" ? null : next,
            from: bounds.from,
            to: bounds.to,
            page: null,
          });
        }}
        dateOptions={DATE_OPTIONS}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{filtered.length} visible</Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setStatus("all");
                setDateRange("all");
                pushQuery({ q: null, status: null, date: null, from: null, to: null, page: null });
              }}
              disabled={search.length === 0 && status === "all" && dateRange === "all"}
            >
              Reset filters
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              Showing {filtered.length} of {totalCount ?? subscriptions.length} subscriptions
            </span>
            <span className="text-muted-foreground">Plan / status / renewal</span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="No subscriptions match"
              description="Try a different search or reset the filters."
            />
          ) : (
            <>
              <MobileDataList
                items={filtered}
                empty={null}
                getKey={(subscription) => subscription.id}
                renderItem={(subscription) => (
                  <MobileDataCard
                    title={subscription.business_name}
                    subtitle={subscription.plan_key}
                    meta={
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={subscription.status === "active" ? "default" : "outline"}>
                          {subscription.status}
                        </Badge>
                        <span>
                          {subscription.current_period_end
                            ? new Date(subscription.current_period_end).toLocaleDateString()
                            : "No renewal date"}
                        </span>
                      </div>
                    }
                  />
                )}
              />

              <div className="hidden rounded-lg border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Business</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Period start</TableHead>
                      <TableHead>Renewal</TableHead>
                      <TableHead>Auto-renew</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell className="font-medium">{sub.business_name}</TableCell>
                        <TableCell className="text-muted-foreground">{sub.plan_key}</TableCell>
                        <TableCell>
                          <Badge variant={sub.status === "active" ? "default" : "outline"}>
                            {sub.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {sub.current_period_start
                            ? new Date(sub.current_period_start).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {sub.current_period_end
                            ? new Date(sub.current_period_end).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {sub.cancel_at_period_end ? "Cancel at period end" : "Auto-renew"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
          {footer}
        </CardContent>
      </Card>
    </div>
  );
}
