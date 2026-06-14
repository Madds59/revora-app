"use client";

import { useActionState, useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  approveQuote,
  removeItem,
  sendQuote,
  type FormState,
} from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: FormState = {};

function useToastFromState(state: FormState) {
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
}

export function RemoveItemButton({
  itemId,
  quotationId,
}: {
  itemId: string;
  quotationId: string;
}) {
  const [state, action] = useActionState(removeItem, initial);
  const t = useTranslations("forms.quote");
  useToastFromState(state);
  return (
    <form action={action}>
      <input type="hidden" name="item_id" value={itemId} />
      <input type="hidden" name="quotation_id" value={quotationId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        aria-label={t("removeItem")}
      >
        <Trash2 className="size-4" />
      </Button>
    </form>
  );
}

export function SendQuoteButton({ quotationId }: { quotationId: string }) {
  const [state, action] = useActionState(sendQuote, initial);
  const t = useTranslations("forms.quote");
  useToastFromState(state);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={quotationId} />
      <SubmitButton>{t("sendToCustomer")}</SubmitButton>
    </form>
  );
}

export function ApproveForm({
  quotationId,
  businessId,
  customerId,
  version,
  language,
}: {
  quotationId: string;
  businessId: string;
  customerId: string;
  version: number;
  language: string;
}) {
  const [state, action] = useActionState(approveQuote, initial);
  const t = useTranslations("forms.quote");
  useToastFromState(state);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="quotation_id" value={quotationId} />
      <input type="hidden" name="business_id" value={businessId} />
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="quotation_version" value={version} />
      <input type="hidden" name="language" value={language} />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="acknowledge"
          className="mt-0.5 size-4"
          required
        />
        <span>{t("acknowledge")}</span>
      </label>
      <div className="grid max-w-sm gap-2">
        <Label htmlFor="signature">{t("signLabel")}</Label>
        <Input id="signature" name="signature" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="customer_note">{t("optionalNote")}</Label>
        <Textarea
          id="customer_note"
          name="customer_note"
          rows={3}
          placeholder={t("noteForWorkshop")}
        />
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton>{t("approve")}</SubmitButton>
      </div>
    </form>
  );
}
