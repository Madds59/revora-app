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
import { requireMembership } from "@/lib/auth";
import { canManageComplaints } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type {
  Complaint,
  ComplaintMessage,
  Customer,
  Profile,
} from "@/lib/database.types";
import {
  COMPLAINT_SEVERITY_LABELS,
  COMPLAINT_SEVERITY_VARIANT,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_STATUS_VARIANT,
} from "@/lib/complaints";

import { loadComplaintEvidence } from "@/lib/evidence";
import { recordComplaintEvidence } from "@/lib/evidence-actions";
import { PRIVATE_BUCKET } from "@/lib/storage";
import { ComplaintAssignmentModal } from "@/components/complaint-assignment-modal";
import { ComplaintManagementForm } from "@/components/complaint-management-form";
import { ComplaintMessagingPanel } from "@/components/complaint-messaging-panel";
import { EvidenceGallery } from "@/components/evidence-gallery";
import { FileUpload } from "@/components/file-upload";
import { addComplaintMessage, updateComplaint } from "../actions";

type ComplaintDetailRecord = Complaint & {
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  assignee_name: string | null;
};

type MessageRecord = ComplaintMessage & {
  sender_name: string | null;
};

type StaffOption = {
  id: string;
  label: string;
};

type CustomerLookup = Pick<Customer, "id" | "full_name" | "email" | "phone">;
type ProfileLookup = Pick<Profile, "id" | "full_name">;

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function ComplaintMeta({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export default async function ComplaintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member, business } = await requireMembership();
  if (!canManageComplaints(member.role)) notFound();

  const supabase = await createClient();

  const [{ data: complaintRow }, { data: messageRows }, { data: memberRows }] =
    await Promise.all([
      supabase.from("complaints").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("complaint_messages")
        .select("*")
        .eq("complaint_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("business_members")
        .select("user_id")
        .eq("business_id", business.id)
        .eq("is_active", true),
    ]);

  if (!complaintRow) notFound();

  const complaint = complaintRow as Complaint;
  const messages = (messageRows ?? []) as ComplaintMessage[];

  const assigneeIds = [
    ...new Set([
      ...(complaint.assigned_to ? [complaint.assigned_to] : []),
      ...(memberRows ?? []).map((row) => row.user_id),
    ]),
  ];

  const senderIds = [
    ...new Set(messages.map((message) => message.sender_id).filter(Boolean)),
  ] as string[];

  const [customerResult, assigneeProfiles, senderProfiles] = await Promise.all([
    supabase
      .from("customers")
      .select("id, full_name, email, phone")
      .eq("business_id", business.id)
      .eq("id", complaint.customer_id)
      .maybeSingle(),
    assigneeIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", assigneeIds)
      : Promise.resolve({ data: [] as ProfileLookup[] }),
    senderIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", senderIds)
      : Promise.resolve({ data: [] as ProfileLookup[] }),
  ]);

  const customer = customerResult.data as CustomerLookup | null;
  const assigneeMap = new Map<string, string | null>();
  (assigneeProfiles.data ?? []).forEach((profile) => {
    assigneeMap.set(profile.id, profile.full_name);
  });
  const senderMap = new Map<string, string | null>();
  (senderProfiles.data ?? []).forEach((profile) => {
    senderMap.set(profile.id, profile.full_name);
  });

  const typedComplaint: ComplaintDetailRecord = {
    ...complaint,
    customer_name: customer?.full_name ?? null,
    customer_email: customer?.email ?? null,
    customer_phone: customer?.phone ?? null,
    assignee_name: complaint.assigned_to
      ? assigneeMap.get(complaint.assigned_to) ?? null
      : null,
  };

  const typedMessages: MessageRecord[] = messages.map((message) => ({
    ...message,
    sender_name: message.sender_id ? senderMap.get(message.sender_id) ?? null : null,
  }));

  const assignees: StaffOption[] = (memberRows ?? [])
    .map((row) => {
      const fullName = assigneeMap.get(row.user_id);
      if (!fullName) return null;
      return {
        id: row.user_id,
        label: fullName,
      };
    })
    .filter(Boolean) as StaffOption[];

  const evidence = await loadComplaintEvidence(typedComplaint.id);

  return (
    <>
      <PageHeader
        title={typedComplaint.subject}
        description={
          [typedComplaint.customer_name, typedComplaint.customer_email]
            .filter(Boolean)
            .join(" · ") || "Complaint detail"
        }
        action={
          <Link href="/complaints" className={buttonVariants({ variant: "outline" })}>
            Back to complaints
          </Link>
        }
      />

      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Complaint summary</CardTitle>
            <CardDescription>
              Operational status, ownership, and the core complaint record.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant={COMPLAINT_STATUS_VARIANT[typedComplaint.status]}>
                  {COMPLAINT_STATUS_LABELS[typedComplaint.status]}
                </Badge>
                <Badge variant={COMPLAINT_SEVERITY_VARIANT[typedComplaint.severity]}>
                  {COMPLAINT_SEVERITY_LABELS[typedComplaint.severity]}
                </Badge>
                {typedComplaint.assignee_name && (
                  <Badge variant="outline">
                    Assigned to {typedComplaint.assignee_name}
                  </Badge>
                )}
              </div>

              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {typedComplaint.description}
              </p>

              <dl className="grid gap-4 sm:grid-cols-2">
                <ComplaintMeta label="Customer" value={typedComplaint.customer_name ?? "—"} />
                <ComplaintMeta label="Customer email" value={typedComplaint.customer_email ?? "—"} />
                <ComplaintMeta label="Customer phone" value={typedComplaint.customer_phone ?? "—"} />
                <ComplaintMeta label="Created" value={formatDate(typedComplaint.created_at)} />
                <ComplaintMeta label="Resolved" value={formatDate(typedComplaint.resolved_at)} />
                <ComplaintMeta label="Escalated" value={formatDate(typedComplaint.escalated_at)} />
              </dl>
            </div>

            <div className="flex flex-col gap-4 rounded-lg border p-4">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Assignment
                </p>
                <p className="text-sm">
                  {typedComplaint.assignee_name ?? "Unassigned"}
                </p>
                <ComplaintAssignmentModal
                  action={updateComplaint}
                  complaintId={typedComplaint.id}
                  currentAssigneeId={typedComplaint.assigned_to}
                  assignees={assignees}
                />
              </div>

              <ComplaintManagementForm
                action={updateComplaint}
                complaintId={typedComplaint.id}
                currentSeverity={typedComplaint.severity}
                currentStatus={typedComplaint.status}
              />
            </div>
          </CardContent>
        </Card>

        {typedComplaint.resolution_summary && (
          <Card>
            <CardHeader>
              <CardTitle>Resolution summary</CardTitle>
              <CardDescription>Recorded closeout notes for this complaint.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-6">
                {typedComplaint.resolution_summary}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Evidence</CardTitle>
            <CardDescription>
              Customer-submitted and staff-added photos and files.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <EvidenceGallery items={evidence} />
            <FileUpload
              bucket={PRIVATE_BUCKET}
              businessId={typedComplaint.business_id}
              entity="complaint-evidence"
              label="Add evidence"
              onUpload={recordComplaintEvidence.bind(null, typedComplaint.id)}
            />
          </CardContent>
        </Card>

        <ComplaintMessagingPanel
          title="Threaded messages"
          description="Staff replies, customer replies, and internal notes in one thread."
          entries={typedMessages}
          complaintId={typedComplaint.id}
          businessId={typedComplaint.business_id}
          replyLabel="Post staff reply"
          onReply={addComplaintMessage}
          allowInternalOnly
        />
      </div>
    </>
  );
}
