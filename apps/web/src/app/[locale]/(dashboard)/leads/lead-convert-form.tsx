"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormState = { error?: string; message?: string };
type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const initial: FormState = {};

export function LeadConvertForm({
  action,
  leadId,
  suggestedEmail,
  suggestedName,
  suggestedPhone,
}: {
  action: Action;
  leadId: string;
  suggestedEmail: string | null;
  suggestedName: string | null;
  suggestedPhone: string | null;
}) {
  const [state, formAction] = useActionState(action, initial);
  const t = useTranslations("dashboardLeads.convert");
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
          <Label htmlFor="full_name">{t("fullName")}</Label>
          <Input id="full_name" name="full_name" defaultValue={suggestedName ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">{t("phone")}</Label>
          <Input id="phone" name="phone" defaultValue={suggestedPhone ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" name="email" type="email" defaultValue={suggestedEmail ?? ""} />
        </div>
      </div>

      <SubmitButton className="w-fit">
        {t("submit")}
      </SubmitButton>
    </form>
  );
}
