"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { FilterToolbar } from "@/components/filter-toolbar";
import { NotificationReadButton } from "./notification-read-button";
import { MarkAllReadButton } from "./mark-all-read-button";
import type { NotificationEvent } from "@/lib/database.types";

export type DashboardNotificationRow = NotificationEvent & {
  customer: { full_name: string | null; email: string | null } | null;
};

const STATUS_OPTIONS = [
  { label: "All statuses", value: "all" },
  { label: "Unread", value: "unread" },
  { label: "Read", value: "read" },
  { label: "Queued", value: "queued" },
  { label: "Sent", value: "sent" },
  { label: "Failed", value: "failed" },
];

const DATE_OPTIONS = [
  { label: "All time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  queued: "secondary",
  sent: "default",
  delivered: "default",
  failed: "destructive",
};

function titleCase(value: string) {
  return value
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function notificationLabel(templateKey: string): string {
  const key = templateKey.toLowerCase();
  if (key.includes("quote") && (key.includes("approved") || key.includes("approved"))) {
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
  return titleCase(templateKey);
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function withinDateRange(value: string, range: string) {
  if (range === "all") return true;
  const now = new Date();
  const created = new Date(value);
  if (range === "today") {
    return created.toDateString() === now.toDateString();
  }
  const days = range === "7d" ? 7 : 30;
  const threshold = new Date(now);
  threshold.setDate(now.getDate() - days);
  return created >= threshold;
}

export function NotificationsPanel({
  notifications,
  businessId,
}: {
  businessId: string;
  notifications: DashboardNotificationRow[];
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dateRange, setDateRange] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notifications.filter((notification) => {
      const label = notificationLabel(notification.template_key);
      const matchesSearch =
        q.length === 0 ||
        label.toLowerCase().includes(q) ||
        notification.template_key.toLowerCase().includes(q) ||
        notification.channel.toLowerCase().includes(q) ||
        notification.customer?.email?.toLowerCase().includes(q) ||
        notification.customer?.full_name?.toLowerCase().includes(q);
      const matchesStatus =
        status === "all" ||
        (status === "unread" && !notification.read_at) ||
        (status === "read" && !!notification.read_at) ||
        notification.status === status;
      const matchesDate = withinDateRange(notification.created_at, dateRange);
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [dateRange, notifications, search, status]);

  const unreadCount = notifications.filter((notification) => !notification.read_at).length;
  const failedCount = notifications.filter((notification) => notification.status === "failed").length;
  const queuedCount = notifications.filter((notification) => notification.status === "queued").length;
  const sentCount = notifications.filter((notification) => ["sent", "delivered"].includes(notification.status)).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unread</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{unreadCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sent</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{sentCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Queued</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{queuedCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{failedCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <FilterToolbar
        searchPlaceholder="Search notifications, customers, or channels"
        searchValue={search}
        onSearchValueChange={setSearch}
        statusValue={status}
        onStatusValueChange={setStatus}
        statusOptions={STATUS_OPTIONS}
        dateValue={dateRange}
        onDateValueChange={setDateRange}
        dateOptions={DATE_OPTIONS}
        action={<MarkAllReadButton businessId={businessId} />}
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No notifications match"
          description="Try a different search or date range."
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((notification) => {
            const label = notificationLabel(notification.template_key);
            const unread = !notification.read_at;
            return (
              <Card key={notification.id}>
                <CardContent className="flex flex-col gap-4 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{label}</h3>
                        <Badge variant={STATUS_VARIANT[notification.status] ?? "outline"}>
                          {notification.status}
                        </Badge>
                        <Badge variant={unread ? "default" : "outline"}>
                          {unread ? "Unread" : "Read"}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {notification.template_key} · {notification.channel}
                      </p>
                    </div>
                    <NotificationReadButton
                      notificationId={notification.id}
                      readAt={notification.read_at}
                    />
                  </div>

                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                        Customer
                      </dt>
                      <dd className="text-sm">
                        {notification.customer?.full_name ?? "—"}
                      </dd>
                      <div className="text-muted-foreground text-xs">
                        {notification.customer?.email ?? "—"}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                        Created
                      </dt>
                      <dd className="text-sm">{formatDate(notification.created_at)}</dd>
                    </div>
                    <div className="space-y-1">
                      <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                        Scheduled
                      </dt>
                      <dd className="text-sm">{formatDate(notification.scheduled_for)}</dd>
                    </div>
                    <div className="space-y-1">
                      <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                        Sent / failed
                      </dt>
                      <dd className="text-sm">
                        {notification.sent_at
                          ? formatDate(notification.sent_at)
                          : notification.failed_at
                            ? formatDate(notification.failed_at)
                            : "—"}
                      </dd>
                    </div>
                  </dl>

                  {notification.failure_reason && (
                    <p className="text-destructive text-sm">{notification.failure_reason}</p>
                  )}

                  <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                    <div className="text-muted-foreground mb-1 uppercase tracking-wide">
                      Payload
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words">
                      {JSON.stringify(notification.payload, null, 2)}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
