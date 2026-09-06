"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { cancelAppointmentPortal, type FormState } from "../actions";
import { Button } from "@/components/ui/button";

const initial: FormState = {};

export function CancelAppointmentButton({ id }: { id: string }) {
  const [state, action] = useActionState(cancelAppointmentPortal, initial);
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
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline">
        Cancel appointment
      </Button>
    </form>
  );
}
