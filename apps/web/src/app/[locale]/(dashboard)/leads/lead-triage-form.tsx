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
import { Textarea } from "@/components/ui/textarea";
import {
  getLeadStatusLabel,
  getLeadUrgencyLabel,
  LEAD_STATUSES,
  LEAD_URGENCIES,
} from "@/lib/leads.js";
import type { LeadStatus, LeadUrgency } from "@/lib/leads-types";

type FormState = { error?: string; message?: string };
type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const initial: FormState = {};

/** Sentinel for "no owner": a Select cannot carry an empty string value. */
const UNASSIGNED = "unassigned";

export function LeadTriageForm({
  action,
  assignees,
  currentAssignee,
  currentStatus,
  currentSummary,
  currentUrgency,
  leadId,
}: {
  action: Action;
  assignees: Array<{ id: string; name: string }>;
  currentAssignee: string | null;
  currentStatus: string;
  currentSummary: string | null;
  currentUrgency: string;
  leadId: string;
}) {
  const [state, formAction] = useActionState(action, initial);
  const t = useTranslations("dashboardLeads.manage");
  const locale = useLocale() === "ar" ? "ar" : "en";
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
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="lead_id" value={leadId} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="status">{t("status")}</Label>
          <Select name="status" defaultValue={currentStatus}>
            <SelectTrigger id="status" className="w-full">
              <SelectValue placeholder={t("status")}>
                {(value) => (value ? getLeadStatusLabel(value as LeadStatus, locale) : null)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {getLeadStatusLabel(status, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="urgency">{t("urgency")}</Label>
          <Select name="urgency" defaultValue={currentUrgency}>
            <SelectTrigger id="urgency" className="w-full">
              <SelectValue placeholder={t("urgency")}>
                {(value) => (value ? getLeadUrgencyLabel(value as LeadUrgency, locale) : null)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {LEAD_URGENCIES.map((urgency) => (
                <SelectItem key={urgency} value={urgency}>
                  {getLeadUrgencyLabel(urgency, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="assigned_to">{t("assignee")}</Label>
          {/*
            A Select cannot carry an empty string value, so "no owner" is a
            sentinel. updateLead maps it back to null before validation --
            optionalUuid would otherwise reject it as a malformed uuid rather
            than reading it as "clear the assignee".
          */}
          <Select name="assigned_to" defaultValue={currentAssignee ?? UNASSIGNED}>
            <SelectTrigger id="assigned_to" className="w-full">
              <SelectValue placeholder={t("unassigned")}>
                {(value) =>
                  !value || value === UNASSIGNED
                    ? t("unassigned")
                    : (assignees.find((person) => person.id === value)?.name ?? null)
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>{t("unassigned")}</SelectItem>
              {assignees.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="summary">{t("title")}</Label>
        <Textarea
          id="summary"
          name="summary"
          rows={3}
          defaultValue={currentSummary ?? ""}
        />
      </div>

      <SubmitButton className="w-fit">
        {t("save")}
      </SubmitButton>
    </form>
  );
}
