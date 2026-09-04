"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  addInvoiceItem,
  createInvoiceCreditNote,
  issueInvoice,
  recordInvoicePayment,
  removeInvoiceItem,
  voidInvoice,
  type FormState,
} from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ITEM_KINDS, INVOICE_PAYMENT_METHODS } from "@/lib/validation/invoices";
import type { ItemKind, InvoicePaymentMethod } from "@/lib/database.types";

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

export function AddInvoiceItemForm({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState(addInvoiceItem, initial);
  const [kind, setKind] = useState<ItemKind>("service");
  const formRef = useRef<HTMLFormElement>(null);
  useToast(state, () => formRef.current?.reset());

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 rounded-lg border p-3">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <input type="hidden" name="kind" value={kind} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Type</Label>
          <Select value={kind} onValueChange={(v) => setKind((v as ItemKind) ?? "service")}>
            <SelectTrigger>
              <SelectValue>{(value) => value}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ITEM_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="item-name">Name</Label>
          <Input id="item-name" name="name" required />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="grid gap-2">
          <Label htmlFor="item-qty">Qty</Label>
          <Input id="item-qty" name="quantity" type="number" step="0.01" defaultValue={1} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="item-price">Unit price</Label>
          <Input id="item-price" name="unit_price" type="number" step="0.01" defaultValue={0} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="item-discount">Discount</Label>
          <Input id="item-discount" name="discount_amount" type="number" step="0.01" defaultValue={0} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="item-tax">Tax %</Label>
          <Input id="item-tax" name="tax_rate" type="number" step="0.01" defaultValue={0} />
        </div>
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton variant="secondary">Add item</SubmitButton>
      </div>
    </form>
  );
}

export function RemoveInvoiceItemButton({ id, invoiceId }: { id: string; invoiceId: string }) {
  const [state, action] = useActionState(removeInvoiceItem, initial);
  useToast(state);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <Button type="submit" variant="ghost" size="sm">
        Remove
      </Button>
    </form>
  );
}

export function IssueInvoiceForm({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState(issueInvoice, initial);
  useToast(state);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton>Issue invoice</SubmitButton>
      </div>
    </form>
  );
}

export function RecordPaymentForm({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState(recordInvoicePayment, initial);
  const [method, setMethod] = useState<InvoicePaymentMethod>("cash");
  const formRef = useRef<HTMLFormElement>(null);
  useToast(state, () => formRef.current?.reset());

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 rounded-lg border p-3">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <input type="hidden" name="method" value={method} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label>Method</Label>
          <Select
            value={method}
            onValueChange={(v) => setMethod((v as InvoicePaymentMethod) ?? "cash")}
          >
            <SelectTrigger>
              <SelectValue>{(value) => value?.replaceAll("_", " ")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {INVOICE_PAYMENT_METHODS.filter((m) => m !== "online_card").map((m) => (
                <SelectItem key={m} value={m}>
                  {m.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="payment-amount">Amount</Label>
          <Input id="payment-amount" name="amount" type="number" step="0.01" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="payment-reference">Reference</Label>
          <Input id="payment-reference" name="reference" />
        </div>
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton variant="secondary">Record payment</SubmitButton>
      </div>
    </form>
  );
}

export function VoidInvoiceForm({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState(voidInvoice, initial);
  useToast(state);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <Textarea name="reason" placeholder="Reason for voiding" required rows={2} />
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton variant="destructive">Void invoice</SubmitButton>
      </div>
    </form>
  );
}

export function CreditNoteForm({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState(createInvoiceCreditNote, initial);
  const formRef = useRef<HTMLFormElement>(null);
  useToast(state, () => formRef.current?.reset());
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="credit-amount">Amount</Label>
          <Input id="credit-amount" name="amount" type="number" step="0.01" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="credit-reason">Reason</Label>
          <Input id="credit-reason" name="reason" required />
        </div>
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton variant="secondary">Issue credit note</SubmitButton>
      </div>
    </form>
  );
}
