import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { reportError } from "@/lib/observability";
import {
  ACTIVE_JOB_STATUSES,
  JOB_STATUS_LABELS,
  JOB_STATUS_VARIANT,
} from "@/lib/jobs";
import type { Job } from "@/lib/database.types";

type ActiveJob = Pick<Job, "id" | "title" | "status"> & {
  business: { name: string } | null;
};

export async function ActiveJobsSection({
  customerIds,
}: {
  customerIds: string[];
}) {
  const t = await getTranslations("portalHome");
  const supabase = await createClient();

  // Active jobs the customer can track (RLS-scoped).
  const { data: jobsData, error } = await supabase
    .from("jobs")
    .select("id, title, status, business:businesses(name)")
    .in("status", ACTIVE_JOB_STATUSES)
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });
  if (error) {
    reportError(error, { section: "portal", extra: { part: "activeJobs" } });
  }
  const activeJobs = (jobsData ?? []) as unknown as ActiveJob[];

  if (activeJobs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="text-primary size-5" />
          {t("activeJobs")}
        </CardTitle>
        <CardDescription>{t("workInProgress")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {activeJobs.map((job) => (
            <Link
              key={job.id}
              href={`/portal/jobs/${job.id}`}
              className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 transition-colors"
            >
              <div>
                <div className="font-medium">{job.title}</div>
                <div className="text-muted-foreground text-xs">
                  {job.business?.name ?? t("workshop")}
                </div>
              </div>
              <Badge variant={JOB_STATUS_VARIANT[job.status]}>
                {JOB_STATUS_LABELS[job.status]}
              </Badge>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
