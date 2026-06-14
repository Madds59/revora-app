import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PlatformMetrics } from "@/lib/database.types";

export default async function AdminOverviewPage() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_platform_metrics");
  const m = data as PlatformMetrics | null;

  const stats: { label: string; value: number | string }[] = [
    { label: "Businesses", value: m?.businesses ?? 0 },
    { label: "Registered users", value: m?.users ?? 0 },
    { label: "Customers", value: m?.customers ?? 0 },
    { label: "Quotations", value: m?.quotations ?? 0 },
    { label: "Approved quotes", value: m?.approved_quotes ?? 0 },
    { label: "Complaints", value: m?.complaints ?? 0 },
    { label: "Open complaints", value: m?.open_complaints ?? 0 },
    { label: "Super admins", value: m?.super_admins ?? 0 },
  ];

  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Tenant and usage metrics across all of Revora."
      />
      <div className="p-6">
        {error ? (
          <p className="text-destructive text-sm">{error.message}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <Card key={s.label}>
                <CardHeader className="pb-2">
                  <CardDescription>{s.label}</CardDescription>
                  <CardTitle className="text-3xl tabular-nums">
                    {s.value}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
