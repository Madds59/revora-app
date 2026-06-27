import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { requireCustomerPortal } from "@/lib/auth";
import { getLocale, getTranslations } from "next-intl/server";
import { getJobStatusLabel, JOB_STATUS_VARIANT } from "@/lib/jobs";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatters";
import type { Job } from "@/lib/database.types";

type JobRow = Pick<
  Job,
  "id" | "title" | "status" | "expected_completion_at" | "created_at" | "updated_at"
> & {
  branch: { name: string } | null;
  business: { name: string } | null;
};

export default async function PortalJobsPage() {
  const t = await getTranslations("portalJobs");
  const tError = await getTranslations("error");
  const locale = await getLocale();
  const { accounts } = await requireCustomerPortal();
  if (accounts.length === 0) {
    return (
      <>
        <PageHeader title={t("title")} description={t("description")} />
        <div className="p-6">
          <EmptyState
            title={t("empty.noLinkedJobsTitle")}
            description={t("empty.noLinkedJobsDescription")}
            action={
              <Link href="/portal" className={buttonVariants({ variant: "outline" })}>
                {t("actions.backToPortal")}
              </Link>
            }
          />
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const customerIds = accounts.map((account) => account.id);

  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, title, status, expected_completion_at, created_at, updated_at, branch:branches(name), business:businesses(name)",
    )
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });
  if (error) console.error("PortalJobsPage failed to load", error);

  const jobs = (data ?? []) as unknown as JobRow[];
  const activeJobs = jobs.filter((job) =>
    ["pending", "approved", "in_progress", "waiting_parts", "delayed"].includes(job.status),
  );
  const completedJobs = jobs.filter((job) => job.status === "completed");

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="flex flex-col gap-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("stats.jobs")}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{jobs.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("stats.active")}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{activeJobs.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("stats.completed")}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{completedJobs.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("list.title")}</CardTitle>
            <CardDescription>{t("list.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error ? (
              <p className="text-destructive text-sm">{tError("description")}</p>
            ) : jobs.length === 0 ? (
              <EmptyState
                title={t("empty.title")}
                description={t("empty.description")}
                action={
                  <Link href="/portal" className={buttonVariants({ variant: "outline" })}>
                    {t("actions.backToPortal")}
                  </Link>
                }
              />
            ) : (
              <>
                <MobileDataList
                  items={jobs}
                  empty={
                    <EmptyState
                      title={t("empty.title")}
                      description={t("empty.description")}
                    />
                  }
                  renderItem={(job) => (
                    <MobileDataCard
                      title={
                        <Link href={`/portal/jobs/${job.id}`} className="font-medium hover:underline">
                          {job.title}
                        </Link>
                      }
                      subtitle={job.business?.name ?? t("fallback.workshop")}
                      meta={
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={JOB_STATUS_VARIANT[job.status]}>
                            {getJobStatusLabel(job.status, locale)}
                          </Badge>
                          <span>{job.branch?.name ?? t("fallback.noBranch")}</span>
                        </div>
                      }
                    >
                      <div className="text-muted-foreground text-xs">
                        {t("labels.expected")} {formatDate(job.expected_completion_at)} · {t("labels.updated")} {formatDate(job.updated_at)}
                      </div>
                    </MobileDataCard>
                  )}
                />

                <div className="hidden rounded-lg border md:block">
                  <table className="w-full caption-bottom text-sm">
                    <thead>
                      <tr className="[&>th]:h-10 [&>th]:px-2 [&>th]:text-start [&>th]:align-middle [&>th]:font-medium [&>th]:whitespace-nowrap">
                        <th>{t("table.job")}</th>
                        <th>{t("table.workshop")}</th>
                        <th>{t("table.branch")}</th>
                        <th>{t("table.status")}</th>
                        <th>{t("table.expected")}</th>
                        <th>{t("table.updated")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((job) => (
                        <tr key={job.id} className="border-b last:border-0">
                          <td className="p-2 align-middle whitespace-nowrap">
                            <Link href={`/portal/jobs/${job.id}`} className="font-medium hover:underline">
                              {job.title}
                            </Link>
                          </td>
                          <td className="p-2 align-middle whitespace-nowrap text-muted-foreground">
                            {job.business?.name ?? t("fallback.none")}
                          </td>
                          <td className="p-2 align-middle whitespace-nowrap text-muted-foreground">
                            {job.branch?.name ?? t("fallback.none")}
                          </td>
                          <td className="p-2 align-middle whitespace-nowrap">
                            <Badge variant={JOB_STATUS_VARIANT[job.status]}>
                              {getJobStatusLabel(job.status, locale)}
                            </Badge>
                          </td>
                          <td className="p-2 align-middle whitespace-nowrap text-muted-foreground">
                            {formatDate(job.expected_completion_at)}
                          </td>
                          <td className="p-2 align-middle whitespace-nowrap text-muted-foreground">
                            {formatDate(job.updated_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
