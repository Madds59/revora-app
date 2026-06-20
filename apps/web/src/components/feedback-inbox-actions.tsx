"use client";

import { useActionState, useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
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
import {
  FEEDBACK_PRIORITIES,
  FEEDBACK_STATUSES,
  getFeedbackPriorityLabel,
  getFeedbackStatusLabel,
} from "@/lib/launch-ops";

type FormState = { error?: string; message?: string };
type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const initial: FormState = {};

export function FeedbackInboxActions({
  action,
  feedbackReportId,
  currentStatus,
  currentPriority,
  disabled = false,
}: {
  action: Action;
  feedbackReportId: string;
  currentStatus: string;
  currentPriority: string;
  disabled?: boolean;
}) {
  const [state, formAction] = useActionState(action, initial);
  const locale = useLocale();
  const t = useTranslations("feedback.inbox");
  const lastMessage = useRef<string | undefined>(undefined);

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
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="feedback_report_id" value={feedbackReportId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`feedback-status-${feedbackReportId}`}>{t("status")}</Label>
          <Select name="status" defaultValue={currentStatus} disabled={disabled}>
            <SelectTrigger id={`feedback-status-${feedbackReportId}`} className="w-full">
              <SelectValue placeholder={t("status")} />
            </SelectTrigger>
            <SelectContent>
              {FEEDBACK_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {getFeedbackStatusLabel(status, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`feedback-priority-${feedbackReportId}`}>{t("priority")}</Label>
          <Select name="priority" defaultValue={currentPriority} disabled={disabled}>
            <SelectTrigger id={`feedback-priority-${feedbackReportId}`} className="w-full">
              <SelectValue placeholder={t("priority")} />
            </SelectTrigger>
            <SelectContent>
              {FEEDBACK_PRIORITIES.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {getFeedbackPriorityLabel(priority, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div className="flex justify-end">
        <SubmitButton variant="secondary" disabled={disabled}>
          {t("update")}
        </SubmitButton>
      </div>
    </form>
  );
}

