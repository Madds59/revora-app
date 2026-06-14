"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ComplaintMessageForm, type ComplaintParentOption } from "@/components/complaint-message-form";
import type { ComplaintMessage } from "@/lib/database.types";
import { buildComplaintThread, type ThreadNode } from "@/lib/complaint-thread";

type ComplaintMessageAction = (
  prev: { error?: string; message?: string },
  formData: FormData,
) => Promise<{ error?: string; message?: string }>;

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function EmptyThread() {
  const t = useTranslations("complaints.messages");
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {t("empty")}
    </div>
  );
}

function ThreadList({ entries }: { entries: ThreadNode[] }) {
  const t = useTranslations("complaints.messages");
  if (entries.length === 0) return <EmptyThread />;

  return (
    <div className="flex flex-col gap-3">
      {entries.map((message) => (
        <div
          key={message.id}
          className="rounded-lg border p-4"
          style={{ marginInlineStart: `${message.depth * 16}px` }}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {message.sender_name ?? message.sender_role}
            </span>
            <span className="uppercase tracking-wide">{message.sender_role}</span>
            {message.internal_only && <Badge variant="outline">{t("internal")}</Badge>}
            <span>{formatDate(message.created_at)}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
            {message.body}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ComplaintMessagingPanel({
  title,
  description,
  entries,
  complaintId,
  businessId,
  replyLabel,
  onReply,
  allowInternalOnly = false,
}: {
  allowInternalOnly?: boolean;
  businessId: string;
  complaintId: string;
  description?: string;
  entries: ComplaintMessage[];
  onReply: ComplaintMessageAction;
  replyLabel: string;
  title?: string;
}) {
  const t = useTranslations("complaints.messages");
  const resolvedTitle = title ?? t("panelTitle");
  const resolvedDescription = description ?? t("panelDescription");
  const threaded = buildComplaintThread(entries);
  const parentReplyOptions: ComplaintParentOption[] = threaded.map((message) => ({
    id: message.id,
    label: `${message.sender_name ?? message.sender_role} · ${message.body.slice(0, 40)}`,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{resolvedTitle}</CardTitle>
        <CardDescription>{resolvedDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ThreadList entries={threaded} />

        <Separator />

        <ComplaintMessageForm
          action={onReply}
          complaintId={complaintId}
          businessId={businessId}
          submitLabel={replyLabel}
          parentOptions={parentReplyOptions}
          allowInternalOnly={allowInternalOnly}
        />
      </CardContent>
    </Card>
  );
}
