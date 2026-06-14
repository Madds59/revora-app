import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
import type { AdminSubscriptionRow, PlatformMetrics } from "@/lib/admin-views";
import { createClient } from "@/lib/supabase/server";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  trialing: "secondary",
  past_due: "destructive",
  canceled: "outline",
  unpaid: "destructive",
  incomplete: "secondary",
};

export default async function AdminBillingPage() {
  await requireSuperAdmin();
  const supabase = await createClient();

  const [{ data: metricsData }, { data: subRows, error }] = await Promise.all([
    supabase.rpc("admin_platform_metrics"),
    supabase.rpc("admin_list_subscriptions"),
  ]);

  const metrics = metricsData as unknown as PlatformMetrics | null;
  const subscriptions = (subRows ?? []) as unknown as AdminSubscriptionRow[];
  const active = subscriptions.filter((sub) => sub.status === "active").length;
  const overdue = subscriptions.filter((sub) => sub.status === "past_due").length;

  return (
    <>
      <PageHeader
        title="Billing"
        description="Platform-level billing and subscription control."
        action={
          <Link href="/admin/subscriptions" className={buttonVariants({ variant: "outline" })}>
            Subscription table
          </Link>
        }
      />
      <div className="flex flex-col gap-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Businesses billed</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {metrics?.businesses ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active subscriptions</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{active}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Past due</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{overdue}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Platform users</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {metrics?.users ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Billing overview</CardTitle>
            <CardDescription>
              Read-only platform billing overview backed by subscription data.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Stripe webhook sync now keeps this view current; plan changes and portal
              actions still happen in the tenant billing flow.
            </div>

            {error ? (
              <p className="text-sm text-destructive">{error.message}</p>
            ) : subscriptions.length === 0 ? (
              <EmptyState
                title="No subscription records yet"
                description="Subscription rows will appear here once Stripe starts syncing tenant billing."
              />
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Business</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Period start</TableHead>
                      <TableHead>Period end</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscriptions.map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell className="font-medium">{sub.business_name}</TableCell>
                        <TableCell className="text-muted-foreground">{sub.plan_key}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[sub.status] ?? "outline"}>
                            {sub.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {sub.current_period_start
                            ? new Date(sub.current_period_start).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {sub.current_period_end
                            ? new Date(sub.current_period_end).toLocaleDateString()
                            : "—"}
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
