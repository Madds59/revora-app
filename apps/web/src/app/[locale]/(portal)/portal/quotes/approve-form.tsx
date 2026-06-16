"use client";

import { useActionState, useEffect, useRef } from "react";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";

import { approveQuote, type FormState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: FormState = {};

export function ApproveForm({
  quotationId,
  businessId,
  customerId,
  version,
  language,
  redirectTo,
}: {
  quotationId: string;
  businessId: string;
  customerId: string;
  version: number;
  language: string;
  redirectTo?: string;
}) {
  const [state, action] = useActionState(approveQuote, initial);
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
      <input type="hidden" name="quotation_id" value={quotationId} />
      <input type="hidden" name="business_id" value={businessId} />
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="quotation_version" value={version} />
      <input type="hidden" name="language" value={language} />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="acknowledge"
          className="accent-primary mt-0.5 size-4"
          required
        />
        <span>{t("acknowledge")}</span>
      </label>
      <div className="grid gap-2">
        <Label htmlFor="signature">{t("signLabel")}</Label>
        <Input
          id="signature"
          name="signature"
          required
          autoComplete="name"
          placeholder={t("signPlaceholder")}
          className="font-heading max-w-sm text-base"
        />
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
      <div className="flex flex-col gap-2">
        <SubmitButton size="lg">
          <ShieldCheck />
          {t("approve")}
        </SubmitButton>
        <p className="text-muted-foreground text-xs">
          {t("approvalRecorded")}
        </p>
      </div>
    </form>
  );
}
