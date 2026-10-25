"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Inbox, SearchX, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { FilterToolbar } from "@/components/filter-toolbar";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
import { matchesQuery } from "@/lib/filtering";
import { formatDate } from "@/lib/formatters";
import {
  getLeadChannelLabel,
  getLeadContactLabel,
  getLeadStatusLabel,
  getLeadUrgencyLabel,
  LEAD_CHANNELS,
  LEAD_STATUSES,
  LEAD_STATUS_VARIANT,
  LEAD_URGENCY_VARIANT,
  OPEN_LEAD_STATUSES,
} from "@/lib/leads.js";
import type { LeadStatus, LeadUrgency } from "@/lib/leads-types";
import { cn } from "@/lib/utils";
import type { InboundChannel } from "@/lib/database.types";

export type LeadListRow = {
  assignee_name: string | null;
  channel: InboundChannel;
  created_at: string;
  customer_name: string | null;
  first_response_at: string | null;
  has_attribution: boolean;
  id: string;
  identity_display_name: string | null;
  identity_handle: string | null;
  safety_flagged: boolean;
  status: string;
  subject: string | null;
  summary: string | null;
  urgency: string;
};

type FilterValue = "all" | "open" | string;

export function LeadsBrowser({
  leads,
  locale,
}: {
  leads: LeadListRow[];
  locale: "en" | "ar";
}) {
  const t = useTranslations("dashboardLeads");
  const [search, setSearch] = useState("");
  const [statusValue, setStatusValue] = useState<FilterValue>("all");
  const [channelValue, setChannelValue] = useState<FilterValue>("all");

  // Only the channels actually present, so the filter never offers an option
  // that yields nothing. LEAD_CHANNELS fixes the order so it does not shuffle
  // as leads arrive.
  const channelOptions = useMemo(() => {
    const present = new Set<string>(leads.map((lead) => lead.channel));
    return LEAD_CHANNELS.filter((channel) => present.has(channel)).map((channel) => ({
      label: getLeadChannelLabel(channel, locale),
      value: channel as string,
    }));
  }, [leads, locale]);

  const statusOptions = useMemo(
    () => [
      { label: t("filters.openOnly"), value: "open" },
      ...LEAD_STATUSES.map((status) => ({
        label: getLeadStatusLabel(status, locale),
        value: status as string,
      })),
    ],
    [locale, t],
  );

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch =
        search.trim().length === 0 ||
        matchesQuery(
          [
            lead.customer_name,
            lead.identity_display_name,
            lead.identity_handle,
            lead.subject,
            lead.summary,
            lead.assignee_name,
          ],
          search,
        );

      const matchesStatus =
        statusValue === "all" ||
        (statusValue === "open"
          ? (OPEN_LEAD_STATUSES as string[]).includes(lead.status)
          : lead.status === statusValue);

      const matchesChannel = channelValue === "all" || lead.channel === channelValue;

      return matchesSearch && matchesStatus && matchesChannel;
    });
  }, [channelValue, leads, search, statusValue]);

  const hasFilters =
    search.trim().length > 0 || statusValue !== "all" || channelValue !== "all";

  function statusBadge(lead: LeadListRow) {
    const status = lead.status as LeadStatus;
    return (
      <Badge variant={LEAD_STATUS_VARIANT[status] ?? "outline"}>
        {getLeadStatusLabel(status, locale)}
      </Badge>
    );
  }

  function urgencyBadge(lead: LeadListRow) {
    const urgency = lead.urgency as LeadUrgency;
    return (
      <Badge variant={LEAD_URGENCY_VARIANT[urgency] ?? "outline"}>
        {getLeadUrgencyLabel(urgency, locale)}
      </Badge>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <FilterToolbar
        searchPlaceholder={t("searchPlaceholder")}
        searchValue={search}
        onSearchValueChange={setSearch}
      />

      <div className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-end md:justify-between">
        <div className="grid flex-1 gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <div className="text-muted-foreground text-xs tracking-wide uppercase">
              {t("filters.status")}
            </div>
            <Select
              value={statusValue}
              onValueChange={(value) => setStatusValue(value ?? "all")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("filters.allStatuses")}>
                  {(value) =>
                    !value || value === "all"
                      ? t("filters.allStatuses")
                      : (statusOptions.find((option) => option.value === value)?.label ?? value)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filters.allStatuses")}</SelectItem>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="text-muted-foreground text-xs tracking-wide uppercase">
              {t("filters.channel")}
            </div>
            <Select
              value={channelValue}
              onValueChange={(value) => setChannelValue(value ?? "all")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("filters.allChannels")}>
                  {(value) =>
                    !value || value === "all"
                      ? t("filters.allChannels")
                      : (channelOptions.find((option) => option.value === value)?.label ?? value)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filters.allChannels")}</SelectItem>
                {channelOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setSearch("");
            setStatusValue("all");
            setChannelValue("all");
          }}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit")}
        >
          <SearchX />
          {t("filters.reset")}
        </button>
      </div>

      <div className="text-muted-foreground flex items-center justify-between gap-3 text-sm">
        <span>{t("summary.visible", { count: filtered.length, total: leads.length })}</span>
        {hasFilters && <Badge variant="secondary">{t("summary.filtered")}</Badge>}
      </div>

      {filtered.length === 0 ? (
        leads.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-4" />}
            title={t("empty.noneTitle")}
            description={t("empty.noneDescription")}
          />
        ) : (
          <EmptyState
            icon={<SearchX className="size-4" />}
            title={t("empty.matchTitle")}
            description={t("empty.matchDescription")}
          />
        )
      ) : (
        <>
          {/* Table from md up; cards below, matching every other browser. */}
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.contact")}</TableHead>
                  <TableHead>{t("table.channel")}</TableHead>
                  <TableHead>{t("table.subject")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  <TableHead>{t("table.urgency")}</TableHead>
                  <TableHead>{t("table.assignee")}</TableHead>
                  <TableHead>{t("table.received")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">
                      <Link href={`/leads/${lead.id}`} className="hover:underline">
                        {getLeadContactLabel(lead, t("table.unassigned"))}
                      </Link>
                      {lead.safety_flagged && (
                        <ShieldAlert
                          className="text-destructive ms-2 inline size-4 align-text-bottom"
                          aria-label={t("detail.safetyFlagged")}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getLeadChannelLabel(lead.channel, locale)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[22rem] truncate">
                      {lead.subject ?? lead.summary ?? "—"}
                    </TableCell>
                    <TableCell>{statusBadge(lead)}</TableCell>
                    <TableCell>{urgencyBadge(lead)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {lead.assignee_name ?? t("table.unassigned")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(lead.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <MobileDataList
            items={filtered}
            empty={null}
            getKey={(lead) => lead.id}
            renderItem={(lead) => (
              <MobileDataCard
                title={
                  <Link href={`/leads/${lead.id}`} className="hover:underline">
                    {getLeadContactLabel(lead, t("table.unassigned"))}
                  </Link>
                }
                subtitle={lead.subject ?? lead.summary ?? undefined}
                action={statusBadge(lead)}
                meta={
                  <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">
                      {getLeadChannelLabel(lead.channel, locale)}
                    </Badge>
                    {urgencyBadge(lead)}
                    {lead.safety_flagged && (
                      <Badge variant="destructive">{t("detail.safetyFlagged")}</Badge>
                    )}
                    <span>{lead.assignee_name ?? t("table.unassigned")}</span>
                    <span>{formatDate(lead.created_at)}</span>
                  </div>
                }
              />
            )}
          />
        </>
      )}
    </div>
  );
}
