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
import type { AdminAuditLogRow } from "@/lib/admin-views";

const DATE_OPTIONS = [
  { label: "All time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "Last year", value: "1y" },
];

const ACTION_OPTIONS = [
  { label: "All actions", value: "all" },
  { label: "Create", value: "create" },
  { label: "Update", value: "update" },
  { label: "Delete", value: "delete" },
  { label: "Other", value: "other" },
];

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
        searchPlaceholder="Search actor, action, or table"
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
        statusOptions={ACTION_OPTIONS}
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
                setDateRange("all");
                setActionFilter("all");
                pushQuery({ q: null, action: null, date: null, from: null, to: null, page: null });
              }}
              disabled={search.length === 0 && dateRange === "all" && actionFilter === "all"}
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
              Showing {filtered.length} of {totalCount ?? logs.length} events
            </span>
            <span className="text-muted-foreground">Actor / action / table</span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="No audit events match"
              description="Try a different search or reset the filters."
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
                    subtitle={log.business_name ?? "Platform"}
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
                      <TableHead>When</TableHead>
                      <TableHead>Business</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Table</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-medium">
                          {log.business_name ?? "Platform"}
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
