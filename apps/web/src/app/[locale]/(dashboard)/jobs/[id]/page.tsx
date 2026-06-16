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
import { requireMembership } from "@/lib/auth";
import { canManageJobs } from "@/lib/permissions";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getJobStatusLabel } from "@/lib/jobs";
import { loadJobAttachments } from "@/lib/documents";
import { uploadDocument } from "@/lib/document-actions";
import { PRIVATE_BUCKET } from "@/lib/storage";
import { EvidenceGallery } from "@/components/evidence-gallery";
import { FileUpload } from "@/components/file-upload";
import { formatDateTime } from "@/lib/formatters";
import type { Job, JobTask, JobUpdate } from "@/lib/database.types";

import {
  AddTaskForm,
  JobStatusForm,
  PostUpdateForm,
  ToggleTaskButton,
} from "../job-controls";

type JobWithRelations = Job & {
  customer: { full_name: string } | null;
  quotation: {
    quote_number: string;
    vehicle: {
      make: string | null;
      model: string | null;
      plate_number: string | null;
    } | null;
  } | null;
};

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member, business } = await requireMembership();
  const canManage = canManageJobs(member.role);
  const locale = await getLocale();
  const supabase = await createClient();

  const { data } = await supabase
    .from("jobs")
    .select(
      "*, customer:customers(full_name), quotation:quotations(quote_number, vehicle:vehicles(make, model, plate_number))",
    )
    .eq("business_id", business.id)
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const job = data as unknown as JobWithRelations;

  const [{ data: taskRows }, { data: updateRows }] = await Promise.all([
    supabase
      .from("job_tasks")
      .select("*")
      .eq("business_id", business.id)
      .eq("job_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("job_updates")
      .select("*")
      .eq("business_id", business.id)
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
  ]);
  const tasks = (taskRows ?? []) as JobTask[];
  const updates = (updateRows ?? []) as JobUpdate[];

  const attachments = await loadJobAttachments(id);
  const v = job.quotation?.vehicle;
  const vehicleLabel = v
    ? [v.make, v.model].filter(Boolean).join(" ") +
      (v.plate_number ? ` · ${v.plate_number}` : "")
    : null;

  return (
    <>
      <PageHeader
        title={
            <span className="flex items-center gap-3">
            {job.title}
            <Badge>{getJobStatusLabel(job.status, locale)}</Badge>
          </span>
        }
        description={[job.customer?.full_name, vehicleLabel].filter(Boolean).join(" · ")}
        action={
          <Link href={`/${locale}/jobs`} className={buttonVariants({ variant: "outline" })}>
            {locale === "ar" ? "العودة إلى المهام" : "Back to jobs"}
          </Link>
        }
      />

      <div className="flex flex-col gap-6 p-6">
        {canManage && (
          <Card>
          <CardHeader>
              <CardTitle>{locale === "ar" ? "الحالة" : "Status"}</CardTitle>
              {job.quotation && job.quotation_id && (
                <CardDescription>
                  {locale === "ar" ? "من عرض السعر " : "From quote "}
                  <Link
                    href={`/${locale}/quotations/${job.quotation_id}`}
                    className="underline"
                  >
                    {job.quotation.quote_number}
                  </Link>
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <JobStatusForm jobId={job.id} current={job.status} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{locale === "ar" ? "المهام" : "Tasks"} ({tasks.filter((t) => t.is_completed).length}/{tasks.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {tasks.length === 0 ? (
              <p className="text-muted-foreground text-sm">{locale === "ar" ? "لا توجد مهام بعد." : "No tasks yet."}</p>
            ) : (
              tasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <span className={t.is_completed ? "text-muted-foreground line-through" : ""}>
                    {t.title}
                  </span>
                  {canManage && (
                    <ToggleTaskButton id={t.id} jobId={job.id} isCompleted={t.is_completed} />
                  )}
                </div>
              ))
            )}
            {canManage && <AddTaskForm jobId={job.id} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{locale === "ar" ? "الصور والمرفقات" : "Photos &amp; attachments"}</CardTitle>
            <CardDescription>
              {locale === "ar"
                ? "صور التقدم والملفات. تظهر للعميل في بوابته."
                : "Progress photos and files. Visible to the customer in their portal."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <EvidenceGallery items={attachments} />
            {canManage && (
              <FileUpload
                bucket={PRIVATE_BUCKET}
                businessId={job.business_id}
                entity="job-photos"
                label={locale === "ar" ? "إضافة صورة / ملف" : "Add photo / file"}
                onUpload={uploadDocument.bind(null, {
                  documentType: "job_photo",
                  jobId: job.id,
                  customerId: job.customer_id,
                  revalidate: [`/jobs/${job.id}`, `/portal/jobs/${job.id}`],
                })}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{locale === "ar" ? "التحديثات" : "Updates"}</CardTitle>
            <CardDescription>
              {locale === "ar"
                ? "ملاحظات التقدم. تظهر التحديثات المرئية للعميل في بوابته."
                : "Progress notes. Customer-visible updates appear in their portal."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {canManage && <PostUpdateForm jobId={job.id} />}
            <div className="flex flex-col gap-3">
              {updates.length === 0 ? (
                <p className="text-muted-foreground text-sm">{locale === "ar" ? "لا توجد تحديثات بعد." : "No updates yet."}</p>
              ) : (
                updates.map((u) => (
                  <div key={u.id} className="rounded-lg border p-3 text-sm">
                    <div className="text-muted-foreground mb-1 flex items-center gap-2 text-xs">
                      <span>{formatDateTime(u.created_at, undefined, locale)}</span>
                      {u.status && <Badge variant="outline">{getJobStatusLabel(u.status, locale)}</Badge>}
                      {!u.visible_to_customer && <Badge variant="secondary">{locale === "ar" ? "داخلي" : "Internal"}</Badge>}
                    </div>
                    {u.message}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
