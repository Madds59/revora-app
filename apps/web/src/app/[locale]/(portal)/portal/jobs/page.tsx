import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { requireCustomerPortal } from "@/lib/auth";
import { JOB_STATUS_LABELS, JOB_STATUS_VARIANT } from "@/lib/jobs";
import { createClient } from "@/lib/supabase/server";
import type { Job } from "@/lib/database.types";

type JobRow = Pick<
  Job,
  "id" | "title" | "status" | "expected_completion_at" | "created_at" | "updated_at"
> & {
  branch: { name: string } | null;
  business: { name: string } | null;
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

export default async function PortalJobsPage() {
  const { accounts } = await requireCustomerPortal();
  if (accounts.length === 0) {
    return (
      <>
        <PageHeader
          title="Jobs"
          description="Track the progress of your work orders."
        />
        <div className="p-6">
          <EmptyState
            title="No jobs are linked to your account yet"
            description="Once the workshop creates a job for one of your vehicles or quotes, it will appear here."
            action={
              <Link href="/portal" className={buttonVariants({ variant: "outline" })}>
                Back to portal
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
    .select("id, title, status, expected_completion_at, created_at, updated_at, branch:branches(name), business:businesses(name)")
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });

  const jobs = (data ?? []) as unknown as JobRow[];
  const activeJobs = jobs.filter((job) => ["pending", "approved", "in_progress", "waiting_parts", "delayed"].includes(job.status));
  const completedJobs = jobs.filter((job) => job.status === "completed");

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Track the progress of your work orders."
      />

      <div className="flex flex-col gap-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Jobs</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{jobs.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{activeJobs.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Completed</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{completedJobs.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your jobs</CardTitle>
            <CardDescription>
              Open a job to see its latest updates and attachments.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error ? (
              <p className="text-destructive text-sm">{error.message}</p>
            ) : jobs.length === 0 ? (
              <EmptyState
                title="No jobs linked to your account yet"
                description="Once the workshop creates a job for one of your vehicles or quotes, it will appear here."
                action={
                  <Link href="/portal" className={buttonVariants({ variant: "outline" })}>
                    Back to portal
                  </Link>
                }
              />
            ) : (
              <>
                <MobileDataList
                  items={jobs}
                  empty={
                    <EmptyState
                      title="No jobs linked to your account yet"
                      description="Once the workshop creates a job, it will appear here."
                    />
                  }
                  renderItem={(job) => (
                    <MobileDataCard
                      title={
                        <Link href={`/portal/jobs/${job.id}`} className="font-medium hover:underline">
                          {job.title}
                        </Link>
                      }
                      subtitle={job.business?.name ?? "Workshop"}
                      meta={
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={JOB_STATUS_VARIANT[job.status]}>
                            {JOB_STATUS_LABELS[job.status]}
                          </Badge>
                          <span>{job.branch?.name ?? "No branch"}</span>
                        </div>
                      }
                    >
                      <div className="text-muted-foreground text-xs">
                        Expected: {formatDate(job.expected_completion_at)} · Updated {formatDate(job.updated_at)}
                      </div>
                    </MobileDataCard>
                  )}
                />

                <div className="hidden rounded-lg border md:block">
                  <table className="w-full caption-bottom text-sm">
                    <thead>
                      <tr className="[&>th]:h-10 [&>th]:px-2 [&>th]:text-start [&>th]:align-middle [&>th]:font-medium [&>th]:whitespace-nowrap">
                        <th>Job</th>
                        <th>Workshop</th>
                        <th>Branch</th>
                        <th>Status</th>
                        <th>Expected</th>
                        <th>Updated</th>
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
                            {job.business?.name ?? "—"}
                          </td>
                          <td className="p-2 align-middle whitespace-nowrap text-muted-foreground">
                            {job.branch?.name ?? "—"}
                          </td>
                          <td className="p-2 align-middle whitespace-nowrap">
                            <Badge variant={JOB_STATUS_VARIANT[job.status]}>
                              {JOB_STATUS_LABELS[job.status]}
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
