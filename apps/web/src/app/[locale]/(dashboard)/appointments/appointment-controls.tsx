"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { toast } from "sonner";

import {
  cancelAppointmentStaff,
  confirmAppointment,
  convertAppointmentToQuotation,
  declineAppointment,
  type FormState,
} from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: FormState = {};

function useToast(state: FormState, onSuccess?: () => void) {
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (state.message && state.message !== last.current) {
      last.current = state.message;
      toast.success(state.message);
      onSuccess?.();
    }
    if (state.error && state.error !== last.current) {
      last.current = state.error;
      toast.error(state.error);
    }
  }, [state, onSuccess]);
}

// Revora operates in the UAE (Asia/Dubai, UTC+04:00 year-round, no DST).
// datetime-local inputs carry no offset, so staff-entered times are always
// interpreted as Dubai local time and stamped with an explicit +04:00 offset
// before submission -- otherwise Postgres would fall back to its session
// timezone, which need not match Dubai and would silently shift the slot.
const DUBAI_OFFSET = "+04:00";

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const dubai = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Dubai" }));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dubai.getFullYear()}-${pad(dubai.getMonth() + 1)}-${pad(dubai.getDate())}T${pad(dubai.getHours())}:${pad(dubai.getMinutes())}`;
}

export function ConfirmAppointmentForm({
  id,
  suggestedStart,
  suggestedEnd,
}: {
  id: string;
  suggestedStart: string;
  suggestedEnd: string;
}) {
  const [state, action] = useActionState(confirmAppointment, initial);
  const locale = useLocale();
  const [start, setStart] = useState(toLocalInput(suggestedStart));
  const [end, setEnd] = useState(toLocalInput(suggestedEnd));
  useToast(state);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="confirmed_start" value={`${start}:00${DUBAI_OFFSET}`} />
      <input type="hidden" name="confirmed_end" value={`${end}:00${DUBAI_OFFSET}`} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="confirmed-start">Start (Dubai time)</Label>
          <Input
            id="confirmed-start"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirmed-end">End (Dubai time)</Label>
          <Input
            id="confirmed-end"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
        </div>
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton>Confirm appointment</SubmitButton>
      </div>
    </form>
  );
}

export function DeclineAppointmentForm({ id }: { id: string }) {
  const [state, action] = useActionState(declineAppointment, initial);
  useToast(state);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <Textarea name="reason" placeholder="Reason for declining" required rows={2} />
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton variant="destructive">Decline</SubmitButton>
      </div>
    </form>
  );
}

export function CancelAppointmentButton({ id }: { id: string }) {
  const [state, action] = useActionState(cancelAppointmentStaff, initial);
  useToast(state);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm">
        Cancel appointment
      </Button>
    </form>
  );
}

export function ConvertToQuotationButton({ id }: { id: string }) {
  const [state, action] = useActionState(convertAppointmentToQuotation, initial);
  useToast(state);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="secondary">Create quotation from this appointment</SubmitButton>
    </form>
  );
}
