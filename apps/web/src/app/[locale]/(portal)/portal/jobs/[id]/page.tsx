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
import { getLocale } from "next-intl/server";
import { getJobStatusLabel, JOB_STATUS_VARIANT } from "@/lib/jobs";
import { loadJobAttachments } from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";
import { EvidenceGallery } from "@/components/evidence-gallery";
import { BusinessRatingForm } from "@/components/business-rating-form";
import { formatDateTime } from "@/lib/formatters";
import type { Job, JobUpdate } from "@/lib/database.types";

type JobWithBusiness = Job & { business: { name: string } | null };

export default async function PortalJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCustomerPortal();
  const locale = await getLocale();
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
              {getJobStatusLabel(job.status, locale)}
            </Badge>
          </span>
        }
        description={job.business?.name ?? undefined}
        action={
          <Link href={`/${locale}/portal/jobs`} className={buttonVariants({ variant: "outline" })}>
            {locale === "ar" ? "العودة إلى المهام" : "Back to jobs"}
          </Link>
        }
      />

      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>{locale === "ar" ? "التقدم" : "Progress"}</CardTitle>
            <CardDescription>
              {job.expected_completion_at
                ? `${locale === "ar" ? "الإنجاز المتوقع" : "Expected completion"}: ${formatDateTime(job.expected_completion_at, undefined, locale)}`
                : locale === "ar"
                  ? "ستظهر تحديثات الورشة هنا."
                  : "Updates from your workshop appear here."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {updates.length === 0 ? (
              <p className="text-muted-foreground text-sm">{locale === "ar" ? "لا توجد تحديثات بعد." : "No updates yet."}</p>
            ) : (
              updates.map((u) => (
                <div key={u.id} className="rounded-lg border p-3 text-sm">
                  <div className="text-muted-foreground mb-1 flex items-center gap-2 text-xs">
                    <span>{formatDateTime(u.created_at, undefined, locale)}</span>
                    {u.status && (
                      <Badge variant="outline">{getJobStatusLabel(u.status, locale)}</Badge>
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
              <CardTitle>{locale === "ar" ? "الصور والمرفقات" : "Photos &amp; attachments"}</CardTitle>
              <CardDescription>{locale === "ar" ? "يشاركها لك الورشة." : "Shared by your workshop."}</CardDescription>
            </CardHeader>
            <CardContent>
              <EvidenceGallery items={attachments} />
            </CardContent>
          </Card>
        )}

        <BusinessRatingForm
          businessId={job.business_id}
          customerId={job.customer_id}
          redirectTo={`/${locale}/portal/jobs`}
        />
      </div>
    </>
  );
}
