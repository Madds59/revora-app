"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { addItem, type FormState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
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
import type { ItemKind } from "@/lib/database.types";

const ITEM_KINDS: ItemKind[] = ["service", "labor", "product", "part"];
const PRODUCT_CATEGORIES = ["genuine", "oem", "aftermarket", "used"] as const;

const initial: FormState = {};

const KIND_LABELS: Record<ItemKind, string> = {
  service: "Service",
  labor: "Labor",
  product: "Product",
  part: "Part",
};

export function AddItemForm({ quotationId }: { quotationId: string }) {
  const [state, action] = useActionState(addItem, initial);
  const t = useTranslations("forms.quote");
  const [kind, setKind] = useState<ItemKind>("service");
  const formRef = useRef<HTMLFormElement>(null);
  const lastMessage = useRef<string | undefined>(undefined);

  const showTransparency = kind === "product" || kind === "part";

  useEffect(() => {
    if (state.message && state.message !== lastMessage.current) {
      lastMessage.current = state.message;
      toast.success(state.message);
      formRef.current?.reset();
      setKind("service");
    }
  }, [state.message]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <input type="hidden" name="quotation_id" value={quotationId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="kind">{t("type")}</Label>
          {/* name="kind" carried by a hidden input so the Select stays controlled */}
          <input type="hidden" name="kind" value={kind} />
          <Select
            value={kind}
            onValueChange={(v) => setKind((v as ItemKind) ?? "service")}
          >
            <SelectTrigger id="kind" className="w-full">
              <SelectValue>{(value) => (value ? KIND_LABELS[value as ItemKind] : null)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ITEM_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="name">{t("name")}</Label>
          <Input id="name" name="name" required placeholder="Brake pads" />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">{t("description")}</Label>
        <Textarea id="description" name="description" rows={2} />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="grid gap-2">
          <Label htmlFor="quantity">{t("qty")}</Label>
          <Input
            id="quantity"
            name="quantity"
            inputMode="decimal"
            defaultValue="1"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="unit_price">{t("unitPrice")}</Label>
          <Input
            id="unit_price"
            name="unit_price"
            inputMode="decimal"
            defaultValue="0"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="discount_amount">{t("discount")}</Label>
          <Input
            id="discount_amount"
            name="discount_amount"
            inputMode="decimal"
            defaultValue="0"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tax_rate">{t("taxRate")}</Label>
          <Input
            id="tax_rate"
            name="tax_rate"
            inputMode="decimal"
            defaultValue="0"
          />
        </div>
      </div>

      {showTransparency && (
        <fieldset className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <legend className="text-muted-foreground px-1 text-xs uppercase">
            {t("productTransparency")}
          </legend>
          <div className="grid gap-2">
            <Label htmlFor="product_category">{t("category")}</Label>
            <Select name="product_category" defaultValue="genuine">
              <SelectTrigger id="product_category" className="w-full">
                <SelectValue className="capitalize">{(value) => value ?? null}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="brand">{t("brand")}</Label>
            <Input id="brand" name="brand" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="warranty">{t("warranty")}</Label>
            <Input id="warranty" name="warranty" placeholder="12 months" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="origin">{t("origin")}</Label>
            <Input id="origin" name="origin" placeholder="Japan" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="supplier">{t("supplier")}</Label>
            <Input id="supplier" name="supplier" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="expected_lifespan">{t("expectedLifespan")}</Label>
            <Input
              id="expected_lifespan"
              name="expected_lifespan"
              placeholder="40,000 km"
            />
          </div>
        </fieldset>
      )}

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton variant="secondary">{t("addLineItem")}</SubmitButton>
      </div>
    </form>
  );
}
