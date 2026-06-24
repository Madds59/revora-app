"use client";

import { useActionState, useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { markBusinessNotificationRead, type NotificationActionState } from "./actions";

const initial: NotificationActionState = {};

type Action = (
  prev: NotificationActionState,
  formData: FormData,
) => Promise<NotificationActionState>;

export function NotificationReadButton({
  notificationId,
  readAt,
  action = markBusinessNotificationRead,
  label = "Mark read",
  readLabel = "Read",
}: {
  action?: Action;
  label?: string;
  notificationId: string;
  readAt: string | null;
  readLabel?: string;
}) {
  const [state, formAction] = useActionState(action, initial);
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

  if (readAt) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Check className="size-3" />
        {readLabel}
      </span>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="notification_id" value={notificationId} />
      <Button type="submit" variant="outline" size="sm">
        {label}
      </Button>
    </form>
  );
}
