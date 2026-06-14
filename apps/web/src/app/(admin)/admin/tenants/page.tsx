import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PaginationControls } from "@/components/pagination-controls";
import { requireSuperAdmin } from "@/lib/auth";
import { parsePageParam } from "@/lib/filtering";
import { createClient } from "@/lib/supabase/server";
import type {
  AdminBusinessFilteredRow,
  PaginatedListResult,
} from "@/lib/database.types";
import { AdminTenantsBrowser } from "./tenants-browser";

function buildHref(
  page: number,
  pageSize: number,
  search = "",
  owner = "",
  date = "",
  from = "",
  to = "",
) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (owner) params.set("owner", owner);
  if (date) params.set("date", date);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (page > 1) params.set("page", String(page));
  if (pageSize !== 25) params.set("pageSize", String(pageSize));
  const query = params.toString();
  return query ? `/admin/tenants?${query}` : "/admin/tenants";
}

export default async function AdminTenantsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    date?: string;
    from?: string;
    page?: string;
    pageSize?: string;
    owner?: string;
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
  const owner = resolvedSearchParams?.owner ?? "";
  const date = resolvedSearchParams?.date ?? "";
  const from = resolvedSearchParams?.from ?? null;
  const to = resolvedSearchParams?.to ?? null;

  const { data, error } = await supabase.rpc("admin_list_businesses_filtered", {
    p_search: search || null,
    p_status: null,
    p_plan: null,
    p_industry: null,
    p_from: from,
    p_to: to,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });

  const result = (data ?? null) as PaginatedListResult<AdminBusinessFilteredRow> | null;
  const businesses = result?.rows ?? [];
  const totalCount = result?.total_count ?? businesses.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Every business on the platform."
      />
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Businesses ({totalCount})</CardTitle>
            <CardDescription>
              Owner, team size, and activity per tenant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-destructive text-sm">{error.message}</p>
            ) : businesses.length === 0 ? (
              <p className="text-muted-foreground text-sm">No businesses yet.</p>
            ) : (
              <AdminTenantsBrowser
                businesses={businesses}
                totalCount={totalCount}
                footer={
                  pageCount > 1 ? (
                    <PaginationControls
                      page={page}
                      pageCount={pageCount}
                      totalCount={totalCount}
                      previousHref={
                        page > 1
                          ? buildHref(
                              page - 1,
                              pageSize,
                              search,
                              owner,
                              date,
                              from ?? "",
                              to ?? "",
                            )
                          : null
                      }
                      nextHref={
                        page < pageCount
                          ? buildHref(
                              page + 1,
                              pageSize,
                              search,
                              owner,
                              date,
                              from ?? "",
                              to ?? "",
                            )
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
