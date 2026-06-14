"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { NotificationReadButton } from "@/components/notification-read-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { FilterToolbar } from "@/components/filter-toolbar";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { AdminNotificationRow } from "@/lib/admin-views";

const DATE_OPTIONS = [
  { label: "All time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "Last year", value: "1y" },
];

const READ_OPTIONS = [
  { label: "All statuses", value: "all" },
  { label: "Unread", value: "unread" },
  { label: "Read", value: "read" },
  { label: "Queued", value: "queued" },
  { label: "Sent", value: "sent" },
  { label: "Failed", value: "failed" },
];

const TYPE_OPTIONS = [
  { label: "All types", value: "all" },
  { label: "Quote", value: "quote" },
  { label: "Complaint", value: "complaint" },
  { label: "Job", value: "job" },
  { label: "Billing", value: "billing" },
  { label: "System", value: "system" },
];

function titleCase(value: string) {
  return value
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function notificationLabel(templateKey: string): string {
  const key = templateKey.toLowerCase();
  if (key.includes("quote") && (key.includes("approved") || key.includes("accept"))) {
    return "Quote approved";
  }
  if (key.includes("quote") && (key.includes("rejected") || key.includes("declined"))) {
    return "Quote rejected";
  }
  if (key.includes("complaint") && key.includes("reply")) {
    return "Complaint replied";
  }
  if (key.includes("complaint") && (key.includes("new") || key.includes("submitted") || key.includes("created"))) {
    return "Complaint submitted";
  }
  if (key.includes("job") && key.includes("update")) {
    return "Job updated";
  }
  if (key.includes("invoice") || key.includes("payment") || key.includes("billing")) {
    return "Billing event";
  }
  if (key.includes("system")) return "System update";
  return titleCase(templateKey);
}

function typeMatches(templateKey: string, filter: string) {
  if (filter === "all") return true;
  const key = templateKey.toLowerCase();
  switch (filter) {
    case "quote":
      return key.includes("quote");
    case "complaint":
      return key.includes("complaint");
    case "job":
      return key.includes("job");
    case "billing":
      return key.includes("invoice") || key.includes("payment") || key.includes("billing");
    case "system":
      return key.includes("system");
    default:
      return true;
  }
}

export function AdminNotificationsBrowser({
  footer,
  notifications,
  totalCount,
}: {
  footer?: ReactNode;
  notifications: AdminNotificationRow[];
  totalCount?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "all");
  const [type, setType] = useState(searchParams.get("type") ?? "all");
  const [dateRange, setDateRange] = useState<DateRange>(
    (searchParams.get("date") as DateRange | null) ?? "all",
  );

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
    setStatus(searchParams.get("status") ?? "all");
    setType(searchParams.get("type") ?? "all");
    setDateRange((searchParams.get("date") as DateRange | null) ?? "all");
  }, [searchParams]);

  function pushQuery(updates: Record<string, string | null | undefined>) {
    const next = updateSearchParams(new URLSearchParams(searchParams.toString()), updates);
    const href = next.toString() ? `${pathname}?${next.toString()}` : pathname;
    router.replace(href, { scroll: false });
  }

  const filtered = useMemo(() => {
    return notifications.filter((notification) => {
      const label = notificationLabel(notification.template_key);
      const matchesSearch = matchesQuery(
        [
          label,
          notification.template_key,
          notification.business_name,
          notification.customer_email,
          notification.channel,
        ],
        search,
      );
      const matchesStatus =
        status === "all" ||
        (status === "unread" && !notification.read_at) ||
        (status === "read" && !!notification.read_at) ||
        notification.status === status;
      const matchesType = typeMatches(notification.template_key, type);
      const matchesDate = withinDateRange(notification.created_at, dateRange);
      return matchesSearch && matchesStatus && matchesType && matchesDate;
    });
  }, [dateRange, notifications, search, status, type]);

  return (
    <div className="flex flex-col gap-6">
      <FilterToolbar
        searchPlaceholder="Search notifications or recipients"
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
        statusOptions={READ_OPTIONS}
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
            <Select
              value={type}
              onValueChange={(value) => {
                const next = value ?? "all";
                setType(next);
                pushQuery({ type: next === "all" ? null : next, page: null });
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Notification type" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="secondary">{filtered.length} visible</Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setStatus("all");
                setType("all");
                setDateRange("all");
                pushQuery({
                  q: null,
                  status: null,
                  type: null,
                  date: null,
                  from: null,
                  to: null,
                  page: null,
                });
              }}
              disabled={
                search.length === 0 && status === "all" && type === "all" && dateRange === "all"
              }
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
              Showing {filtered.length} of {totalCount ?? notifications.length} notifications
            </span>
            <span className="text-muted-foreground">Type / status / date</span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="No notifications match"
              description="Try a different search or reset the filters."
            />
          ) : (
            <>
              <MobileDataList
                items={filtered}
                empty={null}
                getKey={(item) => item.id}
                renderItem={(item) => {
                  const label = notificationLabel(item.template_key);
                  return (
                    <MobileDataCard
                      title={label}
                      subtitle={item.business_name}
                      meta={
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={item.read_at ? "outline" : "default"}>
                            {item.read_at ? "Read" : "Unread"}
                          </Badge>
                          <Badge variant="outline">{item.status}</Badge>
                          <span>{item.channel}</span>
                        </div>
                      }
                      action={
                        <NotificationReadButton
                          notificationId={item.id}
                          readAt={item.read_at}
                        />
                      }
                    />
                  );
                }}
              />

              <div className="hidden rounded-lg border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Business</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-end">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((item) => {
                      const label = notificationLabel(item.template_key);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.business_name}</TableCell>
                          <TableCell className="text-muted-foreground">{label}</TableCell>
                          <TableCell className="capitalize text-muted-foreground">
                            {item.channel}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <Badge variant="outline">{item.status}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <Badge variant={item.read_at ? "outline" : "default"}>
                              {item.read_at ? "Read" : "Unread"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {item.customer_email ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(item.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-end">
                            <NotificationReadButton
                              notificationId={item.id}
                              readAt={item.read_at}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
