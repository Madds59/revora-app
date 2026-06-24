"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { FilterToolbar } from "@/components/filter-toolbar";
import { buttonVariants } from "@/components/ui/button";
import { NotificationReadButton } from "./notification-read-button";
import { MarkAllReadButton } from "./mark-all-read-button";
import type { NotificationEvent } from "@/lib/database.types";
import {
  getCommonLabel,
  getNotificationStatusLabel,
  getNotificationTemplateLabel,
} from "@/lib/display-labels";
import { formatDateTime } from "@/lib/formatters";

export type DashboardNotificationRow = NotificationEvent & {
  customer: { full_name: string | null; email: string | null } | null;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  queued: "secondary",
  sent: "default",
  delivered: "default",
  failed: "destructive",
  skipped_disabled: "outline",
  skipped_missing_recipient: "outline",
  skipped_no_provider: "outline",
  skipped_suppressed: "outline",
};

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
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dateRange, setDateRange] = useState("all");

  const statusOptions = [
    { label: locale === "ar" ? "كل الحالات" : "All statuses", value: "all" },
    { label: getNotificationStatusLabel("unread", locale), value: "unread" },
    { label: getNotificationStatusLabel("read", locale), value: "read" },
    { label: getNotificationStatusLabel("queued", locale), value: "queued" },
    { label: getNotificationStatusLabel("sent", locale), value: "sent" },
    { label: getNotificationStatusLabel("failed", locale), value: "failed" },
  ];

  const dateOptions = [
    { label: locale === "ar" ? "كل الوقت" : "All time", value: "all" },
    { label: locale === "ar" ? "اليوم" : "Today", value: "today" },
    { label: locale === "ar" ? "آخر 7 أيام" : "Last 7 days", value: "7d" },
    { label: locale === "ar" ? "آخر 30 يومًا" : "Last 30 days", value: "30d" },
  ];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notifications.filter((notification) => {
      const label = getNotificationTemplateLabel(notification.template_key, locale);
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
  }, [dateRange, locale, notifications, search, status]);

  const unreadCount = notifications.filter((notification) => !notification.read_at).length;
  const failedCount = notifications.filter((notification) => notification.status === "failed").length;
  const queuedCount = notifications.filter((notification) => notification.status === "queued").length;
  const sentCount = notifications.filter((notification) => ["sent", "delivered"].includes(notification.status)).length;
  const skippedCount = notifications.filter((notification) => notification.status.startsWith("skipped_")).length;
  const channelLabel = (channel: string) => {
    if (channel === "push") return locale === "ar" ? "إشعار فوري" : "Push";
    if (channel === "email") return locale === "ar" ? "بريد إلكتروني" : "Email";
    if (channel === "sms") return locale === "ar" ? "رسالة نصية" : "SMS";
    if (channel === "whatsapp") return locale === "ar" ? "واتساب" : "WhatsApp";
    return channel;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{locale === "ar" ? "غير مقروء" : "Unread"}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{unreadCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{locale === "ar" ? "مرسلة" : "Sent"}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{sentCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{locale === "ar" ? "في الانتظار" : "Queued"}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{queuedCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{locale === "ar" ? "فاشلة / متخطاة" : "Failed / skipped"}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{failedCount + skippedCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <FilterToolbar
        searchPlaceholder={locale === "ar" ? "ابحث عن الإشعارات أو العملاء أو القنوات" : "Search notifications, customers, or channels"}
        searchValue={search}
        onSearchValueChange={setSearch}
        statusValue={status}
        onStatusValueChange={setStatus}
        statusOptions={statusOptions}
        dateValue={dateRange}
        onDateValueChange={setDateRange}
        dateOptions={dateOptions}
        action={<MarkAllReadButton businessId={businessId} />}
      />

      {filtered.length === 0 ? (
        <EmptyState
          title={locale === "ar" ? "لا توجد إشعارات مطابقة" : "No notifications match"}
          description={locale === "ar" ? "جرّب بحثًا أو نطاقًا زمنيًا مختلفًا." : "Try a different search or date range."}
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((notification) => {
            const label = getNotificationTemplateLabel(notification.template_key, locale);
            const unread = !notification.read_at;
            const payload = notification.payload as Record<string, unknown> | null;
            const complaintId = typeof payload?.complaint_id === "string" ? payload.complaint_id : null;
            const recipient =
              notification.recipient_email ??
              notification.recipient_phone ??
              notification.recipient_name ??
              notification.customer?.email ??
              getCommonLabel("none", locale);
            return (
              <Card key={notification.id}>
                <CardContent className="flex flex-col gap-4 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{label}</h3>
                        <Badge variant={STATUS_VARIANT[notification.status] ?? "outline"}>
                          {getNotificationStatusLabel(notification.status, locale)}
                        </Badge>
                        <Badge variant={unread ? "default" : "outline"}>
                          {unread ? getNotificationStatusLabel("unread", locale) : getNotificationStatusLabel("read", locale)}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {label} · {channelLabel(notification.channel)}
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
                        {locale === "ar" ? "العميل" : "Customer"}
                      </dt>
                      <dd className="text-sm">
                        {notification.customer?.full_name ?? getCommonLabel("none", locale)}
                      </dd>
                      <div className="text-muted-foreground text-xs">
                        {notification.customer?.email ?? getCommonLabel("none", locale)}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                        {locale === "ar" ? "تاريخ الإنشاء" : "Created"}
                      </dt>
                      <dd className="text-sm">{formatDateTime(notification.created_at, undefined, locale)}</dd>
                    </div>
                    <div className="space-y-1">
                      <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                        {locale === "ar" ? "المستلم" : "Recipient"}
                      </dt>
                      <dd className="text-sm">{recipient}</dd>
                    </div>
                    <div className="space-y-1">
                      <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                        {locale === "ar" ? "مجدول" : "Scheduled"}
                      </dt>
                      <dd className="text-sm">{formatDateTime(notification.scheduled_for, undefined, locale)}</dd>
                    </div>
                    <div className="space-y-1">
                      <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                        {locale === "ar" ? "الإرسال / الفشل" : "Sent / failed"}
                      </dt>
                      <dd className="text-sm">
                        {notification.sent_at
                          ? formatDateTime(notification.sent_at, undefined, locale)
                          : notification.failed_at
                            ? formatDateTime(notification.failed_at, undefined, locale)
                            : notification.last_attempt_at
                              ? formatDateTime(notification.last_attempt_at, undefined, locale)
                            : getCommonLabel("none", locale)}
                      </dd>
                      <div className="text-muted-foreground text-xs">
                        {locale === "ar" ? "المحاولات" : "Attempts"}: {notification.attempt_count}
                      </div>
                    </div>
                  </dl>

                  <div className="flex flex-wrap items-center gap-2">
                    {complaintId && (
                      <Link
                        href={`/${locale}/complaints/${complaintId}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        {locale === "ar" ? "عرض الشكوى" : "View complaint"}
                      </Link>
                    )}
                    {notification.failure_reason && (
                      <p className="text-destructive text-sm">{notification.failure_reason}</p>
                    )}
                  </div>

                  <details className="rounded-lg border bg-muted/30 p-3 text-xs">
                    <summary className="cursor-pointer text-muted-foreground uppercase tracking-wide">
                      {locale === "ar" ? "تفاصيل تقنية" : "Technical details"}
                    </summary>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words">
                      {JSON.stringify(notification.payload, null, 2)}
                    </pre>
                  </details>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
