"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { createInvoiceFromJob, type FormState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const initial: FormState = {};

export function CreateInvoiceFromJobButton({ jobId }: { jobId: string }) {
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
      <SubmitButton variant="secondary">Create invoice</SubmitButton>
    </form>
  );
}
