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
import type { AdminUserFilteredRow, PaginatedListResult, PlatformMetrics } from "@/lib/admin-views";
import { parsePageParam } from "@/lib/filtering";
import { createClient } from "@/lib/supabase/server";
import { AdminUsersBrowser } from "./users-browser";

function buildHref(
  page: number,
  pageSize: number,
  search = "",
  role = "",
  status = "",
  date = "",
  from = "",
  to = "",
) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (role) params.set("role", role);
  if (status) params.set("status", status);
  if (date) params.set("date", date);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (page > 1) params.set("page", String(page));
  if (pageSize !== 25) params.set("pageSize", String(pageSize));
  const query = params.toString();
  return query ? `/admin/users?${query}` : "/admin/users";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    date?: string;
    from?: string;
    page?: string;
    pageSize?: string;
    q?: string;
    role?: string;
    status?: string;
    to?: string;
  }>;
}) {
  await requireSuperAdmin();
  const supabase = await createClient();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const page = parsePageParam(resolvedSearchParams?.page, 1);
  const pageSize = Number(resolvedSearchParams?.pageSize ?? 25) || 25;
  const search = resolvedSearchParams?.q ?? "";
  const role = resolvedSearchParams?.role ?? "";
  const status = resolvedSearchParams?.status ?? "";
  const date = resolvedSearchParams?.date ?? "";
  const from = resolvedSearchParams?.from ?? null;
  const to = resolvedSearchParams?.to ?? null;

  const [{ data: userRows, error }, { data: metricsData }] = await Promise.all([
    supabase.rpc("admin_list_users_filtered", {
      p_search: search || undefined,
      p_role: role || undefined,
      p_status: status || undefined,
      p_from: from || undefined,
      p_to: to || undefined,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    }),
    supabase.rpc("admin_platform_metrics"),
  ]);

  const result = (userRows ?? null) as unknown as PaginatedListResult<AdminUserFilteredRow> | null;
  const users = result?.rows ?? [];
  const totalCount = result?.total_count ?? users.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const metrics = metricsData as unknown as PlatformMetrics | null;

  return (
    <>
      <PageHeader
        title="Users"
        description="All registered platform users and their tenant footprint."
      />
      <div className="flex flex-col gap-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total users</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {metrics?.users ?? users.length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Super admins</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {metrics?.super_admins ?? users.filter((u) => u.is_super_admin).length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Linked customers</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {users.reduce((total, user) => total + user.linked_customers, 0)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Business memberships</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {users.reduce((total, user) => total + user.business_memberships, 0)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>User table ({totalCount})</CardTitle>
            <CardDescription>
              Platform signups, super-admin status, and tenant linkage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-sm text-destructive">{error.message}</p>
            ) : users.length === 0 ? (
              <EmptyState
                title="No users yet"
                description="Users will appear here once the platform starts collecting signups and memberships."
              />
            ) : (
              <AdminUsersBrowser
                users={users}
                totalCount={totalCount}
                footer={
                  pageCount > 1 ? (
                    <PaginationControls
                      page={page}
                      pageCount={pageCount}
                      totalCount={totalCount}
                      previousHref={
                        page > 1
                          ? buildHref(page - 1, pageSize, search, role, status, date, from ?? "", to ?? "")
                          : null
                      }
                      nextHref={
                        page < pageCount
                          ? buildHref(page + 1, pageSize, search, role, status, date, from ?? "", to ?? "")
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
