"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { FilterToolbar, useDateRangeOptions } from "@/components/filter-toolbar";
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

const STATUS_VALUES = ["all", "active", "trialing", "past_due", "canceled", "unpaid", "incomplete"] as const;

export function AdminSubscriptionsBrowser({
  footer,
  subscriptions,
  totalCount,
}: {
  footer?: ReactNode;
  subscriptions: AdminSubscriptionRow[];
  totalCount?: number;
}) {
  const t = useTranslations("adminSubscriptions.browser");
  const tFilters = useTranslations("common.filters");
  const dateOptions = useDateRangeOptions();
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
        searchPlaceholder={t("searchPlaceholder")}
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
        statusOptions={STATUS_VALUES.map((value) => ({ label: t(`statuses.${value}`), value }))}
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
        dateOptions={dateOptions}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{tFilters("visibleCount", { count: filtered.length })}</Badge>
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
              {tFilters("reset")}
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {t("showing", { shown: filtered.length, total: totalCount ?? subscriptions.length })}
            </span>
            <span className="text-muted-foreground">Plan / status / renewal</span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title={t("noMatch")}
              description={tFilters("noMatchDescription")}
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
                            : t("noRenewalDate")}
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
                      <TableHead>{t("table.business")}</TableHead>
                      <TableHead>{t("table.plan")}</TableHead>
                      <TableHead>{t("table.status")}</TableHead>
                      <TableHead>{t("table.periodStart")}</TableHead>
                      <TableHead>{t("table.renewal")}</TableHead>
                      <TableHead>{t("table.autoRenew")}</TableHead>
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
                          {sub.cancel_at_period_end ? t("cancelAtPeriodEnd") : t("autoRenew")}
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
