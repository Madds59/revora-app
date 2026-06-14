import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
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
  AdminAuditLogFilteredRow,
  PaginatedListResult,
} from "@/lib/admin-views";
import { parsePageParam } from "@/lib/filtering";
import { createClient } from "@/lib/supabase/server";
import { AdminAuditLogsBrowser } from "./audit-logs-browser";

function buildHref(
  page: number,
  pageSize: number,
  search = "",
  action = "",
  entity = "",
  date = "",
  from = "",
  to = "",
) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (action) params.set("action", action);
  if (entity) params.set("entity", entity);
  if (date) params.set("date", date);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (page > 1) params.set("page", String(page));
  if (pageSize !== 25) params.set("pageSize", String(pageSize));
  const query = params.toString();
  return query ? `/admin/audit-logs?${query}` : "/admin/audit-logs";
}

export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    action?: string;
    date?: string;
    entity?: string;
    from?: string;
    page?: string;
    pageSize?: string;
    q?: string;
    to?: string;
  }>;
}) {
  await requireSuperAdmin();
  const supabase = await createClient();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const page = parsePageParam(resolvedSearchParams?.page, 1);
  const pageSize = Number(resolvedSearchParams?.pageSize ?? 25) || 25;
  const search = resolvedSearchParams?.q ?? "";
  const action = resolvedSearchParams?.action ?? "";
  const entity = resolvedSearchParams?.entity ?? "";
  const date = resolvedSearchParams?.date ?? "";
  const from = resolvedSearchParams?.from ?? "";
  const to = resolvedSearchParams?.to ?? "";

  const { data, error } = await supabase.rpc("admin_list_audit_logs_filtered", {
    p_search: search || undefined,
    p_action: action || undefined,
    p_entity: entity || undefined,
    p_from: from || undefined,
    p_to: to || undefined,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  const result = (data ?? null) as unknown as PaginatedListResult<AdminAuditLogFilteredRow> | null;
  const logs = result?.rows ?? [];
  const totalCount = result?.total_count ?? logs.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <>
      <PageHeader
        title="Audit logs"
        description="Cross-tenant record changes and administrative actions."
      />
      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Activity stream ({totalCount})</CardTitle>
            <CardDescription>
              Latest create, update, and delete events across the platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-sm text-destructive">{error.message}</p>
            ) : logs.length === 0 ? (
              <EmptyState
                title="No audit events yet"
                description="Administrative activity will appear here once tenants and platform operators start making changes."
              />
            ) : (
              <AdminAuditLogsBrowser
                logs={logs}
                totalCount={totalCount}
                footer={
                  pageCount > 1 ? (
                    <PaginationControls
                      page={page}
                      pageCount={pageCount}
                      totalCount={totalCount}
                      previousHref={
                        page > 1
                          ? buildHref(page - 1, pageSize, search, action, entity, date, from, to)
                          : null
                      }
                      nextHref={
                        page < pageCount
                          ? buildHref(page + 1, pageSize, search, action, entity, date, from, to)
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
