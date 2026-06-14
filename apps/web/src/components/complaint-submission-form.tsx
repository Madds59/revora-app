"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ComplaintSeverity } from "@/lib/database.types";

const COMPLAINT_SEVERITIES: ComplaintSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export type ComplaintAccountOption = {
  customer_id: string;
  business_id: string;
  label: string;
};

type FormState = { error?: string; message?: string };
type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const initial: FormState = {};

export function ComplaintSubmissionForm({
  action,
  accounts,
}: {
  action: Action;
  accounts: ComplaintAccountOption[];
}) {
  const [state, formAction] = useActionState(action, initial);
  const [accountIndex, setAccountIndex] = useState(accounts[0]?.customer_id ?? "");
  const lastMessage = useRef<string | undefined>(undefined);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.customer_id === accountIndex),
    [accounts, accountIndex],
  );

  useEffect(() => {
    if (state.message && state.message !== lastMessage.current) {
      lastMessage.current = state.message;
      toast.success(state.message);
    }
    if (state.error && state.error !== lastMessage.current) {
      lastMessage.current = state.error;
      toast.error(state.error);
    }
  }, [state.error, state.message]);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="customer_id">Business account</Label>
        <Select
          name="customer_id"
          value={accountIndex}
          onValueChange={(value) => setAccountIndex(value ?? "")}
          required
        >
          <SelectTrigger id="customer_id" className="w-full">
            <SelectValue placeholder="Select an account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.customer_id} value={account.customer_id}>
                {account.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <input
        type="hidden"
        name="business_id"
        value={selectedAccount?.business_id ?? ""}
      />

      <div className="grid gap-2">
        <Label htmlFor="severity">Severity</Label>
        <Select name="severity" defaultValue="medium">
          <SelectTrigger id="severity" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMPLAINT_SEVERITIES.map((severity) => (
              <SelectItem key={severity} value={severity}>
                {severity}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" name="subject" required />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={5} required />
      </div>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton disabled={!accountIndex}>Submit complaint</SubmitButton>
      </div>
    </form>
  );
}
