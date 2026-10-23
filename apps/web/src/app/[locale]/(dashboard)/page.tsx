import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import {
  Users,
  FileCheck2,
  MessageSquareWarning,
  Wrench,
  CarFront,
  ArrowRight,
  ClipboardCheck,
  Lock,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusBanner } from "@/components/status-banner";
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
import { disabledBannerKey } from "@/lib/features/flags";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_JOB_STATUSES } from "@/lib/jobs";
import { formatNumber } from "@/lib/formatters";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ disabled?: string | string[] }>;
}) {
  const t = await getTranslations("dashboardHome");
  const tf = await getTranslations("features");
  const { disabled } = await searchParams;
  const disabledKey = disabledBannerKey(disabled);
  const { business } = await requireMembership();
  const supabase = await createClient();

  const [
    { count: customerCount },
    { count: vehicleCount },
    { count: pendingQuoteCount },
    { count: openComplaintCount },
    { count: activeJobCount },
    { count: inspectionsToQuoteCount },
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
    supabase
      .from("vehicle_inspections")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "completed")
      .is("quotation_id", null),
  ]);

  const locale = (await getLocale()) === "ar" ? "ar" : "en";

  const pipeline = [
    {
      label: t("pipeline.inspectionsToQuote"),
      hint: t("pipeline.inspectionsToQuoteHint"),
      value: inspectionsToQuoteCount ?? 0,
      icon: ClipboardCheck,
      href: "/inspections",
    },
    {
      label: t("pipeline.quotesAwaitingApproval"),
      hint: t("pipeline.quotesAwaitingApprovalHint"),
      value: pendingQuoteCount ?? 0,
      icon: FileCheck2,
      href: "/quotes",
    },
    {
      label: t("pipeline.jobsInProgress"),
      hint: t("pipeline.jobsInProgressHint"),
      value: activeJobCount ?? 0,
      icon: Wrench,
      href: "/jobs",
    },
  ];

  const secondary = [
    { label: t("stats.customers"), value: customerCount ?? 0, icon: Users },
    { label: t("stats.vehicles"), value: vehicleCount ?? 0, icon: CarFront },
    { label: t("stats.openComplaints"), value: openComplaintCount ?? 0, icon: MessageSquareWarning },
  ];

  return (
    <>
      <PageHeader
        title={t("title", { businessName: business.name })}
        description={t("description")}
      />
      <div className="flex flex-col gap-6 p-6">
        {disabledKey && (
          <StatusBanner
            tone="muted"
            role="status"
            icon={Lock}
            title={tf("disabled.title", {
              module: tf(`names.${disabledKey}` as Parameters<typeof tf>[0]),
            })}
          >
            <p>{tf("disabled.body")}</p>
          </StatusBanner>
        )}
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium">{t("pipeline.title")}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {pipeline.map((stage) => {
              const Icon = stage.icon;
              return (
                <Link key={stage.href} href={stage.href} className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card className="h-full transition-colors group-hover:border-primary/40">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardDescription>{stage.label}</CardDescription>
                        <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
                          <Icon className="size-4" />
                        </span>
                      </div>
                      <CardTitle className="text-4xl tabular-nums">
                        {formatNumber(stage.value, undefined, locale)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <span className="text-muted-foreground text-xs">{stage.hint}</span>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-3">
          {secondary.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.label}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardDescription>{s.label}</CardDescription>
                    <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="size-4" />
                    </span>
                  </div>
                  <CardTitle className="text-3xl tabular-nums">
                    {formatNumber(s.value, undefined, locale)}
                  </CardTitle>
                </CardHeader>
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
              href="/inspections/new"
              className={cn(buttonVariants({ size: "lg" }), "w-full justify-center")}
            >
              {t("getStarted.startInspection")}
              <ArrowRight className="rtl:rotate-180" />
            </Link>
            <Link
              href="/customers/new"
              className={cn(
                buttonVariants({ variant: "secondary", size: "lg" }),
                "w-full justify-center",
              )}
            >
              {t("getStarted.addCustomer")}
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
