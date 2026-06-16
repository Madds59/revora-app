"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";

import { updateQuoteDetails, type FormState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Quotation } from "@/lib/database.types";

const initial: FormState = {};

export function QuoteDetailsForm({
  quote,
  disabled,
  redirectTo,
}: {
  quote: Pick<
    Quotation,
    | "id"
    | "expected_completion_date"
    | "warranty_terms"
    | "customer_notes"
    | "internal_notes"
  >;
  disabled: boolean;
  redirectTo?: string;
}) {
  const [state, action] = useActionState(updateQuoteDetails, initial);
  const t = useTranslations("forms.quote");
  const router = useRouter();
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (state.message && state.message !== last.current) {
      last.current = state.message;
      toast.success(state.message);
      if (redirectTo) router.replace(redirectTo);
    }
  }, [redirectTo, router, state.message]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={quote.id} />
      <fieldset disabled={disabled} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="expected_completion_date">
              {t("expectedCompletion")}
            </Label>
            <Input
              id="expected_completion_date"
              name="expected_completion_date"
              type="date"
              defaultValue={quote.expected_completion_date ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="warranty_terms">{t("warrantyTerms")}</Label>
            <Input
              id="warranty_terms"
              name="warranty_terms"
              defaultValue={quote.warranty_terms ?? ""}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="customer_notes">{t("customerNotes")}</Label>
          <Textarea
            id="customer_notes"
            name="customer_notes"
            rows={2}
            defaultValue={quote.customer_notes ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="internal_notes">{t("internalNotes")}</Label>
          <Textarea
            id="internal_notes"
            name="internal_notes"
            rows={2}
            defaultValue={quote.internal_notes ?? ""}
          />
        </div>
        {state.error && (
          <p className="text-destructive text-sm">{state.error}</p>
        )}
        {!disabled && (
          <div>
            <SubmitButton variant="secondary">{t("saveDetails")}</SubmitButton>
          </div>
        )}
      </fieldset>
    </form>
  );
}
