"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { FormState } from "./actions";
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
import type { Customer } from "@/lib/database.types";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const initial: FormState = {};

export function CustomerForm({
  action,
  customer,
  submitLabel,
}: {
  action: Action;
  customer?: Pick<
    Customer,
    "id" | "full_name" | "phone" | "email" | "preferred_language"
  >;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, initial);
  const t = useTranslations("forms.customer");
  const lastMessage = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.message && state.message !== lastMessage.current) {
      lastMessage.current = state.message;
      toast.success(state.message);
    }
  }, [state.message]);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <div className="grid gap-2">
        <Label htmlFor="full_name">{t("fullName")}</Label>
        <Input
          id="full_name"
          name="full_name"
          required
          defaultValue={customer?.full_name ?? ""}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="phone">{t("phone")}</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={customer?.phone ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={customer?.email ?? ""}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="preferred_language">{t("preferredLanguage")}</Label>
        <Select
          name="preferred_language"
          defaultValue={customer?.preferred_language ?? "en"}
        >
          <SelectTrigger id="preferred_language" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">{t("languageEnglish")}</SelectItem>
            <SelectItem value="ar">{t("languageArabic")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
