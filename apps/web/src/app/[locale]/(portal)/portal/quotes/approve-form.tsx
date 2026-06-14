"use client";

import { useActionState, useEffect, useRef } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { approveQuote, type FormState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: FormState = {};

export function ApproveForm({
  quotationId,
  businessId,
  customerId,
  version,
  language,
}: {
  quotationId: string;
  businessId: string;
  customerId: string;
  version: number;
  language: string;
}) {
  const [state, action] = useActionState(approveQuote, initial);
  const last = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.message && state.message !== last.current) {
      last.current = state.message;
      toast.success(state.message);
    }
  }, [state.message]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="quotation_id" value={quotationId} />
      <input type="hidden" name="business_id" value={businessId} />
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="quotation_version" value={version} />
      <input type="hidden" name="language" value={language} />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="acknowledge"
          className="accent-primary mt-0.5 size-4"
          required
        />
        <span>
          I acknowledge the parts, pricing, warranty, and terms of this
          quotation.
        </span>
      </label>
      <div className="grid gap-2">
        <Label htmlFor="signature">Type your full name to sign</Label>
        <Input
          id="signature"
          name="signature"
          required
          autoComplete="name"
          placeholder="Your full name"
          className="font-heading max-w-sm text-base"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="customer_note">Optional note</Label>
        <Textarea
          id="customer_note"
          name="customer_note"
          rows={3}
          placeholder="Add a note for the workshop"
        />
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div className="flex flex-col gap-2">
        <SubmitButton size="lg">
          <ShieldCheck />
          Approve quotation
        </SubmitButton>
        <p className="text-muted-foreground text-xs">
          Your approval is recorded with a secure timestamp and digital
          signature.
        </p>
      </div>
    </form>
  );
}
