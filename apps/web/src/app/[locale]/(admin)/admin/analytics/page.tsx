import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireSuperAdmin } from "@/lib/auth";
import type { AdminBusinessRow, PlatformMetrics } from "@/lib/admin-views";
import { createClient } from "@/lib/supabase/server";

export default async function AdminAnalyticsPage() {
  await requireSuperAdmin();
  const supabase = await createClient();

  const [{ data: metricsData }, { data: businessesData }] = await Promise.all([
    supabase.rpc("admin_platform_metrics"),
    supabase.rpc("admin_list_businesses"),
  ]);

  const metrics = metricsData as unknown as PlatformMetrics | null;
  const businesses = (businessesData ?? []) as unknown as AdminBusinessRow[];
  const topBusinesses = [...businesses]
    .sort((a, b) => b.quote_count + b.complaint_count - (a.quote_count + a.complaint_count))
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Cross-tenant activity, operations, and growth signals."
      />
      <div className="flex flex-col gap-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Businesses</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {metrics?.businesses ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Customers</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {metrics?.customers ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Quotes</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {metrics?.quotations ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Complaints</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {metrics?.complaints ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Top tenants</CardTitle>
            <CardDescription>
              Businesses with the most quote and complaint activity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {businesses.length === 0 ? (
              <EmptyState
                title="No tenant activity yet"
                description="Analytics will fill in once businesses start generating quotes, complaints, and customer growth."
              />
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Business</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead className="text-end">Members</TableHead>
                      <TableHead className="text-end">Quotes</TableHead>
                      <TableHead className="text-end">Complaints</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topBusinesses.map((business) => (
                      <TableRow key={business.id}>
                        <TableCell className="font-medium">{business.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {business.owner_email ?? "—"}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {business.member_count}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {business.quote_count}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {business.complaint_count}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
