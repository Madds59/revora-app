"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { openBillingPortal, type BillingActionState } from "@/app/[locale]/(dashboard)/billing/actions";
import { SubmitButton } from "@/components/submit-button";

const initial: BillingActionState = {};

export function BillingPortalButton() {
  const [state, action] = useActionState(openBillingPortal, initial);
  const last = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.error && state.error !== last.current) {
      last.current = state.error;
      toast.error(state.error);
    }
  }, [state.error]);

  return (
    <form action={action}>
      {state.message && <p className="sr-only">{state.message}</p>}
      <SubmitButton>Open billing portal</SubmitButton>
    </form>
  );
}
