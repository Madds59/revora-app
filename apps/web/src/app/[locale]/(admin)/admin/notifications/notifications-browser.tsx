"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { NotificationReadButton } from "@/components/notification-read-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { FilterToolbar, useDateRangeOptions } from "@/components/filter-toolbar";
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
import { getCommonLabel, getNotificationTemplateLabel } from "@/lib/display-labels";
import type { AppLocale } from "@/lib/formatters";
import { normalizeLocale } from "@/lib/locale-path.js";
import type { AdminNotificationRow } from "@/lib/admin-views";

const READ_VALUES = ["all", "unread", "read", "queued", "sent", "failed"] as const;
const TYPE_VALUES = ["all", "quote", "complaint", "job", "billing", "system"] as const;

function titleCase(value: string) {
  return value
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Human label for a template key. Known templates come from the shared
 * display-labels table (EN/AR); anything unrecognised falls back to a
 * title-cased key so the row is still readable.
 */
function notificationLabel(templateKey: string, locale: AppLocale, systemUpdate: string): string {
  const key = templateKey.toLowerCase();
  if (key.includes("invoice") || key.includes("payment")) {
    return getNotificationTemplateLabel("billing_event", locale);
  }
  const known = getNotificationTemplateLabel(templateKey, locale);
  if (known !== getCommonLabel("unknown", locale)) return known;
  if (key.includes("system")) return systemUpdate;
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
  const t = useTranslations("adminNotifications.browser");
  const tFilters = useTranslations("common.filters");
  const locale = normalizeLocale(useLocale());
  const dateOptions = useDateRangeOptions();
  const typeOptions = TYPE_VALUES.map((value) => ({ label: t(`types.${value}`), value }));
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
      const label = notificationLabel(notification.template_key, locale, t("systemUpdate"));
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
  }, [dateRange, locale, notifications, search, status, t, type]);

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
        statusOptions={READ_VALUES.map((value) => ({ label: t(`statuses.${value}`), value }))}
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
            <Select
              value={type}
              onValueChange={(value) => {
                const next = value ?? "all";
                setType(next);
                pushQuery({ type: next === "all" ? null : next, page: null });
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("typePlaceholder")}>
                  {(value) => typeOptions.find((option) => option.value === value)?.label ?? null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="secondary">{tFilters("visibleCount", { count: filtered.length })}</Badge>
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
              {tFilters("reset")}
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {t("showing", { shown: filtered.length, total: totalCount ?? notifications.length })}
            </span>
            <span className="text-muted-foreground">Type / status / date</span>
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
                getKey={(item) => item.id}
                renderItem={(item) => {
                  const label = notificationLabel(item.template_key, locale, t("systemUpdate"));
                  return (
                    <MobileDataCard
                      title={label}
                      subtitle={item.business_name}
                      meta={
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={item.read_at ? "outline" : "default"}>
                            {item.read_at ? t("read") : t("unread")}
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
                      <TableHead>{t("table.business")}</TableHead>
                      <TableHead>{t("table.type")}</TableHead>
                      <TableHead>{t("table.channel")}</TableHead>
                      <TableHead>{t("table.status")}</TableHead>
                      <TableHead>{t("table.state")}</TableHead>
                      <TableHead>{t("table.customer")}</TableHead>
                      <TableHead>{t("table.created")}</TableHead>
                      <TableHead className="text-end">{t("table.action")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((item) => {
                      const label = notificationLabel(item.template_key, locale, t("systemUpdate"));
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
                              {item.read_at ? t("read") : t("unread")}
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
