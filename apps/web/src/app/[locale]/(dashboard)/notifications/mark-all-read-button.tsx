"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { SubmitButton } from "@/components/submit-button";
import { markAllBusinessNotificationsRead, type NotificationActionState } from "./actions";

const initial: NotificationActionState = {};

export function MarkAllReadButton({
  businessId,
  label = "Mark all read",
}: {
  businessId: string;
  label?: string;
}) {
  const [state, action] = useActionState(markAllBusinessNotificationsRead, initial);
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
  }, [state.error, state.message]);

  return (
    <form action={action}>
      <input type="hidden" name="business_id" value={businessId} />
      <SubmitButton variant="outline" size="sm">
        {label}
      </SubmitButton>
    </form>
  );
}
