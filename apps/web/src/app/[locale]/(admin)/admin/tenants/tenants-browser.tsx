"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FilterToolbar } from "@/components/filter-toolbar";
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

const DATE_OPTIONS = [
  { label: "All time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "Last year", value: "1y" },
];

function businessHealth(business: AdminBusinessRow) {
  return business.owner_email ? "Owned" : "No owner email";
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
          businessHealth(business),
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
  }, [businesses, dateRange, ownerFilter, search]);

  return (
    <div className="flex flex-col gap-6">
      <FilterToolbar
        searchPlaceholder="Search businesses or owner email"
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
          { label: "All owners", value: "all" },
          { label: "With owner email", value: "with_owner" },
          { label: "Without owner email", value: "without_owner" },
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
                setOwnerFilter("all");
                pushQuery({ q: null, owner: null, date: null, from: null, to: null, page: null });
              }}
              disabled={search.length === 0 && dateRange === "all" && ownerFilter === "all"}
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
              Showing {filtered.length} of {totalCount ?? businesses.length} tenants
            </span>
            <span className="text-muted-foreground">Business / owner / activity</span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="No tenants match"
              description="Try a different search or reset the filters."
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
                    subtitle={business.owner_email ?? "No owner email"}
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
                      <TableHead>Business</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-end">Members</TableHead>
                      <TableHead className="text-end">Customers</TableHead>
                      <TableHead className="text-end">Quotes</TableHead>
                      <TableHead className="text-end">Complaints</TableHead>
                      <TableHead>Created</TableHead>
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
                            {businessHealth(business)}
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
