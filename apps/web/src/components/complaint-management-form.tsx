"use client";

import { useActionState, useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { SubmitButton } from "@/components/submit-button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  ComplaintSeverity,
  ComplaintStatus,
} from "@/lib/database.types";

const COMPLAINT_STATUSES: ComplaintStatus[] = [
  "open",
  "assigned",
  "awaiting_customer",
  "investigating",
  "escalated",
  "resolved",
  "closed",
];
const COMPLAINT_SEVERITIES: ComplaintSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
];

type FormState = { error?: string; message?: string };
type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const initial: FormState = {};

export function ComplaintManagementForm({
  action,
  complaintId,
  currentSeverity,
  currentStatus,
}: {
  action: Action;
  complaintId: string;
  currentSeverity: ComplaintSeverity;
  currentStatus: ComplaintStatus;
}) {
  const [state, formAction] = useActionState(action, initial);
  const t = useTranslations("complaints.management");
  const lastMessage = useRef<string | undefined>(undefined);
  const statusOptions = useMemo(() => COMPLAINT_STATUSES, []);

  useEffect(() => {
    if (state.message && state.message !== lastMessage.current) {
      lastMessage.current = state.message;
      toast.success(state.message);
    }
    if (state.error && state.error !== lastMessage.current) {
      lastMessage.current = state.error;
      toast.error(state.error);
    }
  }, [state.error, state.message]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="complaint_id" value={complaintId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="status">{t("status")}</Label>
          <Select name="status" defaultValue={currentStatus}>
            <SelectTrigger id="status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="severity">{t("severity")}</Label>
          <Select name="severity" defaultValue={currentSeverity}>
            <SelectTrigger id="severity" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPLAINT_SEVERITIES.map((severity) => (
                <SelectItem key={severity} value={severity}>
                  {severity}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="resolution_summary">{t("resolutionSummary")}</Label>
        <Textarea
          id="resolution_summary"
          name="resolution_summary"
          rows={3}
        />
      </div>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton variant="secondary">{t("submit")}</SubmitButton>
      </div>
    </form>
  );
}
