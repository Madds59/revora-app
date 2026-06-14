import Link from "next/link";
import { getTranslations } from "next-intl/server";

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
  const t = await getTranslations("adminBilling");
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
        title={t("title")}
        description={t("description")}
        action={
          <Link href="/admin/subscriptions" className={buttonVariants({ variant: "outline" })}>
            {t("actions.subscriptionTable")}
          </Link>
        }
      />
      <div className="flex flex-col gap-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("stats.businessesBilled")}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {metrics?.businesses ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("stats.activeSubscriptions")}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{active}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("stats.pastDue")}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{overdue}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("stats.platformUsers")}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {metrics?.users ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("cardTitle")}</CardTitle>
            <CardDescription>{t("cardDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {t("note")}
            </div>

            {error ? (
              <p className="text-sm text-destructive">{error.message}</p>
            ) : subscriptions.length === 0 ? (
              <EmptyState
                title={t("empty.title")}
                description={t("empty.description")}
              />
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("table.business")}</TableHead>
                      <TableHead>{t("table.plan")}</TableHead>
                      <TableHead>{t("table.status")}</TableHead>
                      <TableHead>{t("table.periodStart")}</TableHead>
                      <TableHead>{t("table.periodEnd")}</TableHead>
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
                            : t("fallback.none")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {sub.current_period_end
                            ? new Date(sub.current_period_end).toLocaleDateString()
                            : t("fallback.none")}
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
