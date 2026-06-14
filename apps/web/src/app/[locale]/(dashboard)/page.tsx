import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Users,
  FileCheck2,
  MessageSquareWarning,
  Wrench,
  CarFront,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_JOB_STATUSES } from "@/lib/jobs";

type Stat = {
  label: string;
  value: number | string;
  icon: LucideIcon;
  ready: boolean;
};

export default async function HomePage() {
  const t = await getTranslations("dashboardHome");
  const { business } = await requireMembership();
  const supabase = await createClient();

  const [
    { count: customerCount },
    { count: vehicleCount },
    { count: pendingQuoteCount },
    { count: openComplaintCount },
    { count: activeJobCount },
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .is("deleted_at", null),
    supabase
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id),
    supabase
      .from("quotations")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "sent"),
    supabase
      .from("complaints")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .not("status", "in", "(resolved,closed)"),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .in("status", ACTIVE_JOB_STATUSES),
  ]);

  const stats: Stat[] = [
    { label: t("stats.customers"), value: customerCount ?? 0, icon: Users, ready: true },
    { label: t("stats.vehicles"), value: vehicleCount ?? 0, icon: CarFront, ready: true },
    {
      label: t("stats.quotesAwaitingApproval"),
      value: pendingQuoteCount ?? 0,
      icon: FileCheck2,
      ready: true,
    },
    {
      label: t("stats.openComplaints"),
      value: openComplaintCount ?? 0,
      icon: MessageSquareWarning,
      ready: true,
    },
    {
      label: t("stats.activeJobs"),
      value: activeJobCount ?? 0,
      icon: Wrench,
      ready: true,
    },
  ];

  return (
    <>
      <PageHeader
        title={t("title", { businessName: business.name })}
        description={t("description")}
      />
      <div className="flex flex-col gap-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.label}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardDescription>{s.label}</CardDescription>
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg",
                        s.ready
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                  </div>
                  <CardTitle
                    className={cn(
                      "text-3xl tabular-nums",
                      !s.ready && "text-muted-foreground/50",
                    )}
                  >
                    {s.value}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-muted-foreground text-xs">
                    {s.ready ? t("status.live") : t("status.laterRelease")}
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="overflow-hidden">
          <div aria-hidden className="uae-flag-stripe h-1 w-full" />
          <CardHeader>
            <CardTitle>{t("getStarted.title")}</CardTitle>
            <CardDescription>{t("getStarted.description")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Link
              href="/customers/new"
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full justify-center",
              )}
            >
              {t("getStarted.addCustomer")}
              <ArrowRight className="rtl:rotate-180" />
            </Link>
            <Link
              href="/vehicles"
              className={cn(
                buttonVariants({ variant: "secondary", size: "lg" }),
                "w-full justify-center",
              )}
            >
              {t("getStarted.manageVehicles")}
            </Link>
            <Link
              href="/settings/business"
              className={cn(
                buttonVariants({ variant: "secondary", size: "lg" }),
                "w-full justify-center",
              )}
            >
              {t("getStarted.businessSettings")}
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
