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
import type { AdminAuditLogRow } from "@/lib/admin-views";

const ACTION_VALUES = ["all", "create", "update", "delete", "other"] as const;

function actionGroup(action: string) {
  const normalized = action.toLowerCase();
  if (normalized.includes("create") || normalized.includes("insert")) return "create";
  if (normalized.includes("update") || normalized.includes("edit")) return "update";
  if (normalized.includes("delete") || normalized.includes("remove")) return "delete";
  return "other";
}

export function AdminAuditLogsBrowser({
  footer,
  logs,
  totalCount,
}: {
  footer?: ReactNode;
  logs: AdminAuditLogRow[];
  totalCount?: number;
}) {
  const t = useTranslations("adminAuditLogs.browser");
  const tFilters = useTranslations("common.filters");
  const dateOptions = useDateRangeOptions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [dateRange, setDateRange] = useState<DateRange>(
    (searchParams.get("date") as DateRange | null) ?? "all",
  );
  const [actionFilter, setActionFilter] = useState(searchParams.get("action") ?? "all");

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
    setDateRange((searchParams.get("date") as DateRange | null) ?? "all");
    setActionFilter(searchParams.get("action") ?? "all");
  }, [searchParams]);

  function pushQuery(updates: Record<string, string | null | undefined>) {
    const next = updateSearchParams(new URLSearchParams(searchParams.toString()), updates);
    const href = next.toString() ? `${pathname}?${next.toString()}` : pathname;
    router.replace(href, { scroll: false });
  }

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch = matchesQuery(
        [log.actor_email, log.actor_name, log.action, log.table_name, log.business_name],
        search,
      );
      const matchesDate = withinDateRange(log.created_at, dateRange);
      const matchesAction =
        actionFilter === "all" || actionGroup(log.action) === actionFilter;
      return matchesSearch && matchesDate && matchesAction;
    });
  }, [actionFilter, dateRange, logs, search]);

  return (
    <div className="flex flex-col gap-6">
      <FilterToolbar
        searchPlaceholder={t("searchPlaceholder")}
        searchValue={search}
        onSearchValueChange={(value) => {
          setSearch(value);
          pushQuery({ q: value || null, page: null });
        }}
        statusValue={actionFilter}
        onStatusValueChange={(value) => {
          setActionFilter(value);
          pushQuery({ action: value === "all" ? null : value, page: null });
        }}
        statusOptions={ACTION_VALUES.map((value) => ({ label: t(`actions.${value}`), value }))}
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
                setDateRange("all");
                setActionFilter("all");
                pushQuery({ q: null, action: null, date: null, from: null, to: null, page: null });
              }}
              disabled={search.length === 0 && dateRange === "all" && actionFilter === "all"}
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
              {t("showing", { shown: filtered.length, total: totalCount ?? logs.length })}
            </span>
            <span className="text-muted-foreground">Actor / action / table</span>
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
                getKey={(log) => log.id}
                renderItem={(log) => (
                  <MobileDataCard
                    title={log.table_name}
                    subtitle={log.business_name ?? t("platform")}
                    meta={
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{log.action}</Badge>
                        <span>{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                    }
                  />
                )}
              />

              <div className="hidden rounded-lg border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("table.when")}</TableHead>
                      <TableHead>{t("table.business")}</TableHead>
                      <TableHead>{t("table.actor")}</TableHead>
                      <TableHead>{t("table.table")}</TableHead>
                      <TableHead>{t("table.action")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-medium">
                          {log.business_name ?? t("platform")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {log.actor_email ?? log.actor_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {log.table_name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <Badge variant="outline">{log.action}</Badge>
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
