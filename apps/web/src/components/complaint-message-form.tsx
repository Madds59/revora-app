"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ComplaintParentOption = {
  id: string;
  label: string;
};

type FormState = { error?: string; message?: string };
type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const initial: FormState = {};

export function ComplaintMessageForm({
  action,
  complaintId,
  businessId,
  submitLabel,
  parentOptions,
  allowInternalOnly = false,
}: {
  action: Action;
  complaintId: string;
  businessId: string;
  submitLabel: string;
  parentOptions: ComplaintParentOption[];
  allowInternalOnly?: boolean;
}) {
  const [state, formAction] = useActionState(action, initial);
  const t = useTranslations("complaints.messages");
  const [parentMessageId, setParentMessageId] = useState("");
  const lastMessage = useRef<string | undefined>(undefined);

  const options = useMemo(
    () => [{ id: "", label: t("topLevel") }, ...parentOptions],
    [parentOptions, t],
  );

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
      <input type="hidden" name="business_id" value={businessId} />
      <input type="hidden" name="parent_message_id" value={parentMessageId} />

      {options.length > 1 && (
        <div className="grid gap-2">
          <Label htmlFor={`parent_message_id-${complaintId}`}>{t("replyTo")}</Label>
          <select
            id={`parent_message_id-${complaintId}`}
            value={parentMessageId}
            onChange={(event) => setParentMessageId(event.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {options.map((option) => (
              <option key={option.id || "root"} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor={`body-${complaintId}`}>{t("message")}</Label>
        <Textarea id={`body-${complaintId}`} name="body" rows={4} required />
      </div>

      {allowInternalOnly && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="internal_only" className="size-4" />
          <span>{t("internalOnly")}</span>
        </label>
      )}

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

export function ComplaintResetButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label?: string;
}) {
  const t = useTranslations("common.actions");
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick}>
      {label ?? t("reset")}
    </Button>
  );
}
