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
import { IMPLEMENTATION_STAGES, getImplementationStageLabel } from "@/lib/launch-ops";

type FormState = { error?: string; message?: string };
type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const initial: FormState = {};

export function ImplementationNotesForm({
  action,
  businessId,
  currentStage,
  currentNotes,
  disabled = false,
}: {
  action: Action;
  businessId: string;
  currentStage: string;
  currentNotes: string | null;
  disabled?: boolean;
}) {
  const [state, formAction] = useActionState(action, initial);
  const locale = useLocale();
  const t = useTranslations("implementation.form");
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
      <input type="hidden" name="business_id" value={businessId} />
      <div className="grid gap-2">
        <Label htmlFor="implementation-stage">{t("stage")}</Label>
        <Select name="stage" defaultValue={currentStage} disabled={disabled}>
          <SelectTrigger id="implementation-stage" className="w-full">
            <SelectValue placeholder={t("stage")}>
              {(value) =>
                value ? getImplementationStageLabel(value as string, locale) : null
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {IMPLEMENTATION_STAGES.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {getImplementationStageLabel(stage, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="implementation-notes">{t("notes")}</Label>
        <Textarea
          id="implementation-notes"
          name="notes"
          rows={5}
          defaultValue={currentNotes ?? ""}
          disabled={disabled}
          placeholder={t("notesPlaceholder")}
        />
      </div>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div className="flex justify-end">
        <SubmitButton disabled={disabled}>{t("save")}</SubmitButton>
      </div>
    </form>
  );
}
