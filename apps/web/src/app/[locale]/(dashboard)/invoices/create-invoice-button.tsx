"use client";

import { useTranslations } from "next-intl";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { createInvoiceFromJob, type FormState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const initial: FormState = {};

export function CreateInvoiceFromJobButton({ jobId }: { jobId: string }) {
  const t = useTranslations("dashboardInvoices.controls");
  const [state, action] = useActionState(createInvoiceFromJob, initial);
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (state.error && state.error !== last.current) {
      last.current = state.error;
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form action={action}>
      <input type="hidden" name="job_id" value={jobId} />
      <SubmitButton variant="secondary">{t("createInvoice")}</SubmitButton>
    </form>
  );
}
