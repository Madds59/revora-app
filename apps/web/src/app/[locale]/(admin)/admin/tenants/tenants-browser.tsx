"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/empty-state";
import { FilterToolbar, useDateRangeOptions } from "@/components/filter-toolbar";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import type { AdminBusinessRow } from "@/lib/admin-views";

function businessHealth(business: AdminBusinessRow, owned: string, noOwner: string) {
  return business.owner_email ? owned : noOwner;
}

export function AdminTenantsBrowser({
  businesses,
  footer,
  totalCount,
}: {
  businesses: AdminBusinessRow[];
  footer?: ReactNode;
  totalCount?: number;
}) {
  const t = useTranslations("adminTenants.browser");
  const tFilters = useTranslations("common.filters");
  const dateOptions = useDateRangeOptions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [dateRange, setDateRange] = useState<DateRange>(
    (searchParams.get("date") as DateRange | null) ?? "all",
  );
  const [ownerFilter, setOwnerFilter] = useState<"all" | "with_owner" | "without_owner">("all");

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
    return businesses.filter((business) => {
      const matchesSearch = matchesQuery(
        [
          business.name,
          business.owner_email,
          business.id,
          businessHealth(business, t("owned"), t("noOwnerEmail")),
        ],
        search,
      );
      const matchesDate = withinDateRange(business.created_at, dateRange);
      const matchesOwner =
        ownerFilter === "all" ||
        (ownerFilter === "with_owner" && !!business.owner_email) ||
        (ownerFilter === "without_owner" && !business.owner_email);
      return matchesSearch && matchesDate && matchesOwner;
    });
  }, [businesses, dateRange, ownerFilter, search, t]);

  return (
    <div className="flex flex-col gap-6">
      <FilterToolbar
        searchPlaceholder={t("searchPlaceholder")}
        searchValue={search}
        onSearchValueChange={(value) => {
          setSearch(value);
          pushQuery({ q: value || null, page: null });
        }}
        statusValue={ownerFilter}
        onStatusValueChange={(value) => {
          const next = value as typeof ownerFilter;
          setOwnerFilter(next);
          pushQuery({ owner: next === "all" ? null : next, page: null });
        }}
        statusOptions={[
          ...(["all", "with_owner", "without_owner"] as const).map((value) => ({
            label: t(`owners.${value}`),
            value,
          })),
        ]}
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
                setOwnerFilter("all");
                pushQuery({ q: null, owner: null, date: null, from: null, to: null, page: null });
              }}
              disabled={search.length === 0 && dateRange === "all" && ownerFilter === "all"}
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
              {t("showing", { shown: filtered.length, total: totalCount ?? businesses.length })}
            </span>
            <span className="text-muted-foreground">Business / owner / activity</span>
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
                getKey={(business) => business.id}
                renderItem={(business) => (
                  <MobileDataCard
                    title={business.name}
                    subtitle={business.owner_email ?? t("noOwnerEmail")}
                    meta={
                      <div className="flex flex-wrap gap-2">
                        <span>{new Date(business.created_at).toLocaleDateString()}</span>
                        <span>Members {business.member_count}</span>
                        <span>Customers {business.customer_count}</span>
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
                      <TableHead>{t("table.owner")}</TableHead>
                      <TableHead>{t("table.status")}</TableHead>
                      <TableHead className="text-end">{t("table.members")}</TableHead>
                      <TableHead className="text-end">{t("table.customers")}</TableHead>
                      <TableHead className="text-end">{t("table.quotes")}</TableHead>
                      <TableHead className="text-end">{t("table.complaints")}</TableHead>
                      <TableHead>{t("table.created")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((business) => (
                      <TableRow key={business.id}>
                        <TableCell className="font-medium">{business.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {business.owner_email ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={business.owner_email ? "default" : "outline"}>
                            {businessHealth(business, t("owned"), t("noOwnerEmail"))}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {business.member_count}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {business.customer_count}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {business.quote_count}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {business.complaint_count}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(business.created_at).toLocaleDateString()}
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
