"use client";

import { useActionState, useMemo, useState } from "react";

import { createQuote, type FormState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CustomerOption = {
  id: string;
  full_name: string;
  vehicles: { id: string; label: string }[];
};

const initial: FormState = {};

export function NewQuoteForm({ customers }: { customers: CustomerOption[] }) {
  const [state, action] = useActionState(createQuote, initial);
  const [customerId, setCustomerId] = useState<string>("");

  const vehicles = useMemo(
    () => customers.find((c) => c.id === customerId)?.vehicles ?? [],
    [customers, customerId],
  );

  return (
    <form action={action} className="flex max-w-lg flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="customer_id">Customer</Label>
        <Select
          name="customer_id"
          value={customerId}
          onValueChange={(v) => setCustomerId(v ?? "")}
          required
        >
          <SelectTrigger id="customer_id" className="w-full">
            <SelectValue placeholder="Select a customer" />
          </SelectTrigger>
          <SelectContent>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {vehicles.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="vehicle_id">Vehicle (optional)</Label>
          <Select name="vehicle_id">
            <SelectTrigger id="vehicle_id" className="w-full">
              <SelectValue placeholder="No vehicle" />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton disabled={!customerId}>Create draft quote</SubmitButton>
      </div>
    </form>
  );
}
