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
import type { AdminUserRow } from "@/lib/admin-views";

const DATE_OPTIONS = [
  { label: "All time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "Last year", value: "1y" },
];

export function AdminUsersBrowser({
  users,
  footer,
  totalCount,
}: {
  footer?: ReactNode;
  totalCount?: number;
  users: AdminUserRow[];
}) {
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
        searchPlaceholder="Search users by name or email"
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
        statusOptions={[
          { label: "All users", value: "all" },
          { label: "Super admins", value: "super_admin" },
          { label: "Regular users", value: "user" },
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
                setRoleFilter("all");
                pushQuery({ q: null, role: null, date: null, from: null, to: null, page: null });
              }}
              disabled={search.length === 0 && dateRange === "all" && roleFilter === "all"}
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
              Showing {filtered.length} of {totalCount ?? users.length} users
            </span>
            <span className="text-muted-foreground">Platform signups and roles</span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="No users match"
              description="Try a different search or reset the filters."
            />
          ) : (
            <>
              <MobileDataList
                items={filtered}
                empty={null}
                getKey={(user) => user.user_id}
                renderItem={(user) => (
                  <MobileDataCard
                    title={user.email ?? "No email"}
                    subtitle={user.full_name ?? "No name"}
                    meta={
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={user.is_super_admin ? "default" : "outline"}>
                          {user.is_super_admin ? "Super admin" : "User"}
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
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-end">Memberships</TableHead>
                      <TableHead className="text-end">Linked customers</TableHead>
                      <TableHead>Created</TableHead>
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
                            {user.is_super_admin ? "Super admin" : "User"}
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
