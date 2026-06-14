import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PaginationControls } from "@/components/pagination-controls";
import { requireSuperAdmin } from "@/lib/auth";
import type {
  AdminNotificationFilteredRow,
  PaginatedListResult,
} from "@/lib/admin-views";
import { parsePageParam } from "@/lib/filtering";
import { createClient } from "@/lib/supabase/server";
import { AdminNotificationsBrowser } from "./notifications-browser";

function buildHref(
  page: number,
  pageSize: number,
  search = "",
  type = "",
  readState = "",
  date = "",
  from = "",
  to = "",
) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (type) params.set("type", type);
  if (readState) params.set("status", readState);
  if (date) params.set("date", date);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (page > 1) params.set("page", String(page));
  if (pageSize !== 25) params.set("pageSize", String(pageSize));
  const query = params.toString();
  return query ? `/admin/notifications?${query}` : "/admin/notifications";
}

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    date?: string;
    from?: string;
    page?: string;
    pageSize?: string;
    q?: string;
    status?: string;
    type?: string;
    to?: string;
  }>;
}) {
  const t = await getTranslations("adminNotifications");
  await requireSuperAdmin();
  const supabase = await createClient();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const page = parsePageParam(resolvedSearchParams?.page, 1);
  const pageSize = Number(resolvedSearchParams?.pageSize ?? 25) || 25;
  const search = resolvedSearchParams?.q ?? "";
  const type = resolvedSearchParams?.type ?? "";
  const status = resolvedSearchParams?.status ?? "";
  const date = resolvedSearchParams?.date ?? "";
  const from = resolvedSearchParams?.from ?? null;
  const to = resolvedSearchParams?.to ?? null;

  const { data, error } = await supabase.rpc("admin_list_notifications_filtered", {
    p_search: search || undefined,
    p_type: type || undefined,
    p_read_state: status || undefined,
    p_from: from || undefined,
    p_to: to || undefined,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  const result = (data ?? null) as unknown as PaginatedListResult<AdminNotificationFilteredRow> | null;
  const notifications = result?.rows ?? [];
  const totalCount = result?.total_count ?? notifications.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  const queued = notifications.filter((item) => item.status === "queued").length;
  const sent = notifications.filter(
    (item) => item.status === "sent" || item.status === "delivered",
  ).length;
  const failed = notifications.filter((item) => item.status === "failed").length;
  const unread = notifications.filter((item) => !item.read_at).length;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />
      <div className="flex flex-col gap-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("stats.sent")}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{sent}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("stats.queued")}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{queued}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("stats.failed")}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{failed}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("stats.unread")}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {unread}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("cardTitle", { count: totalCount })}</CardTitle>
            <CardDescription>{t("cardDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-sm text-destructive">{error.message}</p>
            ) : notifications.length === 0 ? (
              <EmptyState
                title={t("empty.title")}
                description={t("empty.description")}
              />
            ) : (
              <AdminNotificationsBrowser
                notifications={notifications}
                totalCount={totalCount}
                footer={
                  pageCount > 1 ? (
                    <PaginationControls
                      page={page}
                      pageCount={pageCount}
                      totalCount={totalCount}
                      previousHref={
                        page > 1
                          ? buildHref(page - 1, pageSize, search, type, status, date, from ?? "", to ?? "")
                          : null
                      }
                      nextHref={
                        page < pageCount
                          ? buildHref(page + 1, pageSize, search, type, status, date, from ?? "", to ?? "")
                          : null
                      }
                    />
                  ) : null
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
