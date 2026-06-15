import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireCustomerPortal } from "@/lib/auth";
import { JOB_STATUS_LABELS, JOB_STATUS_VARIANT } from "@/lib/jobs";
import { loadJobAttachments } from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";
import { EvidenceGallery } from "@/components/evidence-gallery";
import { BusinessRatingForm } from "@/components/business-rating-form";
import type { Job, JobUpdate } from "@/lib/database.types";

type JobWithBusiness = Job & { business: { name: string } | null };

export default async function PortalJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCustomerPortal();
  const supabase = await createClient();

  const { data } = await supabase
    .from("jobs")
    .select("*, business:businesses(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const job = data as unknown as JobWithBusiness;

  // RLS (job_updates_access) only returns customer-visible updates here.
  const { data: updateRows } = await supabase
    .from("job_updates")
    .select("*")
    .eq("job_id", id)
    .order("created_at", { ascending: false });
  const updates = (updateRows ?? []) as JobUpdate[];
  const attachments = await loadJobAttachments(id);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {job.title}
            <Badge variant={JOB_STATUS_VARIANT[job.status]}>
              {JOB_STATUS_LABELS[job.status]}
            </Badge>
          </span>
        }
        description={job.business?.name ?? undefined}
        action={
          <Link href="/portal/jobs" className={buttonVariants({ variant: "outline" })}>
            Back to jobs
          </Link>
        }
      />

      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
            <CardDescription>
              {job.expected_completion_at
                ? `Expected completion: ${new Date(job.expected_completion_at).toLocaleDateString()}`
                : "Updates from your workshop appear here."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {updates.length === 0 ? (
              <p className="text-muted-foreground text-sm">No updates yet.</p>
            ) : (
              updates.map((u) => (
                <div key={u.id} className="rounded-lg border p-3 text-sm">
                  <div className="text-muted-foreground mb-1 flex items-center gap-2 text-xs">
                    <span>{new Date(u.created_at).toLocaleString()}</span>
                    {u.status && (
                      <Badge variant="outline">{JOB_STATUS_LABELS[u.status]}</Badge>
                    )}
                  </div>
                  {u.message}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {attachments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Photos &amp; attachments</CardTitle>
              <CardDescription>Shared by your workshop.</CardDescription>
            </CardHeader>
            <CardContent>
              <EvidenceGallery items={attachments} />
            </CardContent>
          </Card>
        )}

        <BusinessRatingForm businessId={job.business_id} customerId={job.customer_id} />
      </div>
    </>
  );
}
