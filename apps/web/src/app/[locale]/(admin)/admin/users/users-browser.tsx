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
import type { AdminUserRow } from "@/lib/admin-views";

export function AdminUsersBrowser({
  users,
  footer,
  totalCount,
}: {
  footer?: ReactNode;
  totalCount?: number;
  users: AdminUserRow[];
}) {
  const t = useTranslations("adminUsers.browser");
  const tFilters = useTranslations("common.filters");
  const dateOptions = useDateRangeOptions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [dateRange, setDateRange] = useState<DateRange>(
    (searchParams.get("date") as DateRange | null) ?? "all",
  );
  const [roleFilter, setRoleFilter] = useState<"all" | "super_admin" | "user">("all");

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
    setDateRange((searchParams.get("date") as DateRange | null) ?? "all");
  }, [searchParams]);

  function pushQuery(updates: Record<string, string | null | undefined>) {
    const next = updateSearchParams(new URLSearchParams(searchParams.toString()), updates);
    const href = next.toString() ? `${pathname}?${next.toString()}` : pathname;
    router.replace(href, { scroll: false });
  }

  const filtered = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch = matchesQuery(
        [user.email, user.full_name, user.user_id],
        search,
      );
      const matchesDate = withinDateRange(user.created_at, dateRange);
      const matchesRole =
        roleFilter === "all" ||
        (roleFilter === "super_admin" && user.is_super_admin) ||
        (roleFilter === "user" && !user.is_super_admin);
      return matchesSearch && matchesDate && matchesRole;
    });
  }, [dateRange, roleFilter, search, users]);

  return (
    <div className="flex flex-col gap-6">
      <FilterToolbar
        searchPlaceholder={t("searchPlaceholder")}
        searchValue={search}
        onSearchValueChange={(value) => {
          setSearch(value);
          pushQuery({ q: value || null, page: null });
        }}
        statusValue={roleFilter}
        onStatusValueChange={(value) => {
          setRoleFilter(value as typeof roleFilter);
          pushQuery({ role: value === "all" ? null : value, page: null });
        }}
        statusOptions={(["all", "super_admin", "user"] as const).map((value) => ({
          label: t(`roles.${value}`),
          value,
        }))}
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
                setRoleFilter("all");
                pushQuery({ q: null, role: null, date: null, from: null, to: null, page: null });
              }}
              disabled={search.length === 0 && dateRange === "all" && roleFilter === "all"}
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
              {t("showing", { shown: filtered.length, total: totalCount ?? users.length })}
            </span>
            <span className="text-muted-foreground">{t("subtitle")}</span>
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
                getKey={(user) => user.user_id}
                renderItem={(user) => (
                  <MobileDataCard
                    title={user.email ?? t("noEmail")}
                    subtitle={user.full_name ?? t("noName")}
                    meta={
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={user.is_super_admin ? "default" : "outline"}>
                          {user.is_super_admin ? t("superAdmin") : t("user")}
                        </Badge>
                        <span>{user.business_memberships} memberships</span>
                        <span>{user.linked_customers} linked customers</span>
                      </div>
                    }
                  />
                )}
              />

              <div className="hidden rounded-lg border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("table.email")}</TableHead>
                      <TableHead>{t("table.name")}</TableHead>
                      <TableHead>{t("table.status")}</TableHead>
                      <TableHead className="text-end">{t("table.memberships")}</TableHead>
                      <TableHead className="text-end">{t("table.linkedCustomers")}</TableHead>
                      <TableHead>{t("table.created")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((user) => (
                      <TableRow key={user.user_id}>
                        <TableCell className="font-medium">{user.email ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.full_name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.is_super_admin ? "default" : "outline"}>
                            {user.is_super_admin ? t("superAdmin") : t("user")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {user.business_memberships}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {user.linked_customers}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(user.created_at).toLocaleDateString()}
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
