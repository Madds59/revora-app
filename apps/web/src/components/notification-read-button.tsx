"use client";

import { useActionState, useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { markNotificationRead, type AdminFormState } from "@/app/[locale]/(admin)/admin/actions";
import { Button } from "@/components/ui/button";

const initial: AdminFormState = {};

type Action = (prev: AdminFormState, formData: FormData) => Promise<AdminFormState>;

export function NotificationReadButton({
  notificationId,
  readAt,
  action = markNotificationRead,
  label,
}: {
  action?: Action;
  label?: string;
  notificationId: string;
  readAt: string | null;
}) {
  const [state, formAction] = useActionState(action, initial);
  const t = useTranslations("forms.notifications");
  const resolvedLabel = label ?? t("markRead");
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

  if (readAt) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Check className="size-3" />
        {t("read")}
      </span>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="notification_id" value={notificationId} />
      <Button type="submit" variant="outline" size="sm">
        {resolvedLabel}
      </Button>
    </form>
  );
}
