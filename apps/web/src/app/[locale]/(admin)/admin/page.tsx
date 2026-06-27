import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth";
import type { PlatformMetrics } from "@/lib/admin-views";
import { createClient } from "@/lib/supabase/server";

export default async function AdminOverviewPage() {
  const t = await getTranslations("adminOverview");
  const tError = await getTranslations("error");
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_platform_metrics");
  if (error) console.error("AdminOverviewPage failed to load", error);
  const m = data as unknown as PlatformMetrics | null;

  const stats: { label: string; value: number | string }[] = [
    { label: t("stats.businesses"), value: m?.businesses ?? 0 },
    { label: t("stats.registeredUsers"), value: m?.users ?? 0 },
    { label: t("stats.customers"), value: m?.customers ?? 0 },
    { label: t("stats.quotations"), value: m?.quotations ?? 0 },
    { label: t("stats.approvedQuotes"), value: m?.approved_quotes ?? 0 },
    { label: t("stats.complaints"), value: m?.complaints ?? 0 },
    { label: t("stats.openComplaints"), value: m?.open_complaints ?? 0 },
    { label: t("stats.superAdmins"), value: m?.super_admins ?? 0 },
  ];

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />
      <div className="p-6">
        {error ? (
          <p className="text-destructive text-sm">{tError("description")}</p>
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
