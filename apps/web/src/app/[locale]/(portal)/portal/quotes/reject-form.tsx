"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { rejectQuote, type FormState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: FormState = {};

export function RejectForm({
  quotationId,
  businessId,
  customerId,
}: {
  quotationId: string;
  businessId: string;
  customerId: string;
}) {
  const [state, action] = useActionState(rejectQuote, initial);
  const t = useTranslations("forms.quote");
  const last = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.message && state.message !== last.current) {
      last.current = state.message;
      toast.success(state.message);
    }
    if (state.error && state.error !== last.current) {
      last.current = state.error;
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="quotation_id" value={quotationId} />
      <input type="hidden" name="business_id" value={businessId} />
      <input type="hidden" name="customer_id" value={customerId} />
      <div className="grid gap-2">
        <Label htmlFor="rejection_note">{t("optionalReason")}</Label>
        <Textarea
          id="rejection_note"
          name="rejection_note"
          rows={3}
          placeholder={t("rejectPlaceholder")}
        />
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton variant="destructive">{t("decline")}</SubmitButton>
      </div>
    </form>
  );
}
