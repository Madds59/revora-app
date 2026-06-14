import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requireCustomerPortal } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Complaint, ComplaintMessage, Profile } from "@/lib/database.types";
import {
  COMPLAINT_SEVERITY_LABELS,
  COMPLAINT_SEVERITY_VARIANT,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_STATUS_VARIANT,
} from "@/lib/complaints";
import { buildComplaintThread } from "@/lib/complaint-thread";
import { loadComplaintEvidence } from "@/lib/evidence";
import { recordComplaintEvidence } from "@/lib/evidence-actions";
import { PRIVATE_BUCKET } from "@/lib/storage";

import { ComplaintMessageForm } from "@/components/complaint-message-form";
import { EvidenceGallery } from "@/components/evidence-gallery";
import { FileUpload } from "@/components/file-upload";
import { addComplaintReply } from "../../actions";

type ComplaintDetail = Complaint & { business_name: string | null };
type MessageRow = ComplaintMessage & { sender_name: string | null };

export default async function PortalComplaintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { accounts } = await requireCustomerPortal();
  const supabase = await createClient();

  const [{ data: complaintRow }, { data: messageRows }] = await Promise.all([
    supabase.from("complaints").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("complaint_messages")
      .select("*")
      .eq("complaint_id", id)
      .eq("internal_only", false)
      .order("created_at", { ascending: true }),
  ]);

  if (!complaintRow) notFound();
  const complaint = complaintRow as Complaint;
  if (!accounts.some((account) => account.id === complaint.customer_id)) {
    notFound();
  }

  const { data: businessRow } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", complaint.business_id)
    .maybeSingle();

  const messages = (messageRows ?? []) as ComplaintMessage[];
  const senderIds = [
    ...new Set(messages.map((message) => message.sender_id).filter(Boolean)),
  ] as string[];
  const { data: senderRows } = senderIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", senderIds)
    : { data: [] as Pick<Profile, "id" | "full_name">[] };
  const senderMap = new Map(
    (senderRows ?? []).map((sender) => [sender.id, sender.full_name ?? null]),
  );

  const typedComplaint: ComplaintDetail = {
    ...complaint,
    business_name: businessRow?.name ?? null,
  };
  const typedMessages: MessageRow[] = messages.map((message) => ({
    ...message,
    sender_name: message.sender_id ? senderMap.get(message.sender_id) ?? null : null,
  }));

  const threaded = buildComplaintThread(typedMessages);
  const parentOptions = threaded.map((message) => ({
    id: message.id,
    label: `${message.sender_role} · ${message.body.slice(0, 40)}`,
  }));

  const latestMessage = threaded[threaded.length - 1];
  const evidence = await loadComplaintEvidence(id);

  return (
    <>
      <PageHeader
        title={typedComplaint.subject}
        description={typedComplaint.business_name ?? "Complaint detail"}
        action={
          <Link
            href="/portal/complaints"
            className={buttonVariants({ variant: "outline" })}
          >
            Back to complaints
          </Link>
        }
      />
      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Current status</CardTitle>
            <CardDescription>
              Tracking your complaint and the business response.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={COMPLAINT_STATUS_VARIANT[typedComplaint.status]}>
                {COMPLAINT_STATUS_LABELS[typedComplaint.status]}
              </Badge>
              <Badge variant={COMPLAINT_SEVERITY_VARIANT[typedComplaint.severity]}>
                {COMPLAINT_SEVERITY_LABELS[typedComplaint.severity]}
              </Badge>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                  Submitted
                </dt>
                <dd className="mt-1 text-sm">
                  {new Date(typedComplaint.created_at).toLocaleString()}
                </dd>
              </div>
              <div className="rounded-lg border p-4">
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                  Latest public activity
                </dt>
                <dd className="mt-1 text-sm">
                  {latestMessage
                    ? new Date(latestMessage.created_at).toLocaleString()
                    : "No public updates yet"}
                </dd>
              </div>
            </dl>
            <p className="text-sm">{typedComplaint.description}</p>
            {typedComplaint.resolution_summary && (
              <div className="rounded-lg border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Resolution summary
                </div>
                <p className="mt-2 text-sm">{typedComplaint.resolution_summary}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evidence</CardTitle>
            <CardDescription>
              Photos or files that support your complaint.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <EvidenceGallery items={evidence} />
            <FileUpload
              bucket={PRIVATE_BUCKET}
              businessId={typedComplaint.business_id}
              entity="complaint-evidence"
              label="Upload evidence"
              onUpload={recordComplaintEvidence.bind(null, typedComplaint.id)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Threaded messages</CardTitle>
            <CardDescription>
              Your replies and business responses appear here.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {threaded.length === 0 ? (
              <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
                No public messages yet. Once the business replies, the thread
                will appear here.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {threaded.map((message) => (
                  <div
                    key={message.id}
                    className="rounded-lg border p-3"
                    style={{ marginInlineStart: `${message.depth * 16}px` }}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{message.sender_role}</span>
                      <span>{new Date(message.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-2 text-sm">{message.body}</p>
                  </div>
                ))}
              </div>
            )}

            <Separator />

            <ComplaintMessageForm
              action={addComplaintReply}
              complaintId={typedComplaint.id}
              businessId={typedComplaint.business_id}
              submitLabel="Send reply"
              parentOptions={parentOptions}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
