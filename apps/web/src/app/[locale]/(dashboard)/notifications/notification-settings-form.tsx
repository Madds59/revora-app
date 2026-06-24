"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import {
  updateBusinessNotificationSettings,
  type NotificationActionState,
} from "./actions";

type NotificationSettingsFormProps = {
  canManage: boolean;
  defaults: {
    emailEnabled: boolean;
    liveSendEnabled: boolean;
    smsEnabled: boolean;
  };
  labels: {
    disabledHint: string;
    email: string;
    liveSend: string;
    liveSendDescription: string;
    noOpHint: string;
    save: string;
    sms: string;
  };
};

const initialState: NotificationActionState = {};

export function NotificationSettingsForm({
  canManage,
  defaults,
  labels,
}: NotificationSettingsFormProps) {
  const [state, action, pending] = useActionState(
    updateBusinessNotificationSettings,
    initialState,
  );
  const last = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.error && state.error !== last.current) {
      last.current = state.error;
      toast.error(state.error);
    }
    if (state.message && state.message !== last.current) {
      last.current = state.message;
      toast.success(state.message);
    }
  }, [state.error, state.message]);

  return (
    <form action={action} className="space-y-4">
      <p className="text-muted-foreground text-sm">{labels.noOpHint}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-3 rounded-lg border p-3">
          <input
            type="checkbox"
            name="email_enabled"
            defaultChecked={defaults.emailEnabled}
            disabled={!canManage}
            className="mt-1"
          />
          <span className="grid gap-1">
            <span className="text-sm font-medium">{labels.email}</span>
            <span className="text-muted-foreground text-xs">{labels.disabledHint}</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border p-3">
          <input
            type="checkbox"
            name="sms_enabled"
            defaultChecked={defaults.smsEnabled}
            disabled={!canManage}
            className="mt-1"
          />
          <span className="grid gap-1">
            <span className="text-sm font-medium">{labels.sms}</span>
            <span className="text-muted-foreground text-xs">{labels.disabledHint}</span>
          </span>
        </label>
      </div>
      <div className="rounded-lg border p-3">
        <Label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="live_send_enabled"
            defaultChecked={defaults.liveSendEnabled}
            disabled={!canManage}
            className="mt-1"
          />
          <span className="grid gap-1">
            <span className="text-sm font-medium">{labels.liveSend}</span>
            <span className="text-muted-foreground text-xs">
              {labels.liveSendDescription}
            </span>
          </span>
        </Label>
      </div>
      <Button type="submit" disabled={!canManage || pending}>
        {labels.save}
      </Button>
    </form>
  );
}
