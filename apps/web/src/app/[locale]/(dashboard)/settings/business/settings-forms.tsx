"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  addBranch,
  addService,
  updateBusiness,
  type FormState,
} from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Business } from "@/lib/database.types";

const initial: FormState = {};

function useToastOnMessage(message: string | undefined, onSuccess?: () => void) {
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (message && message !== last.current) {
      last.current = message;
      toast.success(message);
      onSuccess?.();
    }
  }, [message, onSuccess]);
}

export function BusinessProfileForm({
  business,
  canEdit,
}: {
  business: Business;
  canEdit: boolean;
}) {
  const [state, action] = useActionState(updateBusiness, initial);
  const t = useTranslations("settings.business");
  useToastOnMessage(state.message);

  return (
    <form action={action} className="flex max-w-lg flex-col gap-4">
      <fieldset disabled={!canEdit} className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="name">{t("name")}</Label>
          <Input id="name" name="name" required defaultValue={business.name} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="legal_name">{t("legalName")}</Label>
          <Input
            id="legal_name"
            name="legal_name"
            defaultValue={business.legal_name ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tagline">{t("tagline")}</Label>
          <Input
            id="tagline"
            name="tagline"
            defaultValue={business.tagline ?? ""}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="country">{t("country")}</Label>
            <Input
              id="country"
              name="country"
              defaultValue={business.country}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="default_language">{t("defaultLanguage")}</Label>
            <Input
              id="default_language"
              name="default_language"
              defaultValue={business.default_language}
            />
          </div>
        </div>
        {state.error && (
          <p className="text-destructive text-sm">{state.error}</p>
        )}
        {canEdit && (
          <div>
            <SubmitButton>{t("save")}</SubmitButton>
          </div>
        )}
      </fieldset>
      {!canEdit && (
        <p className="text-muted-foreground text-sm">
          {t("ownersOnly")}
        </p>
      )}
    </form>
  );
}

export function AddBranchForm() {
  const [state, action] = useActionState(addBranch, initial);
  const t = useTranslations("settings.branch");
  const formRef = useRef<HTMLFormElement>(null);
  useToastOnMessage(state.message, () => formRef.current?.reset());

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="branch-name">{t("name")}</Label>
          <Input id="branch-name" name="name" required placeholder="Main" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="branch-phone">{t("phone")}</Label>
          <Input id="branch-phone" name="phone" type="tel" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="branch-email">{t("email")}</Label>
          <Input id="branch-email" name="email" type="email" />
        </div>
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton variant="secondary">{t("add")}</SubmitButton>
      </div>
    </form>
  );
}

export function AddServiceForm() {
  const [state, action] = useActionState(addService, initial);
  const t = useTranslations("settings.service");
  const formRef = useRef<HTMLFormElement>(null);
  useToastOnMessage(state.message, () => formRef.current?.reset());

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="service-name">{t("name")}</Label>
          <Input
            id="service-name"
            name="name"
            required
            placeholder="Oil change"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="service-price">{t("defaultPrice")}</Label>
          <Input
            id="service-price"
            name="default_price"
            inputMode="decimal"
            placeholder="150"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="service-description">{t("description")}</Label>
        <Textarea id="service-description" name="description" rows={2} />
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton variant="secondary">{t("add")}</SubmitButton>
      </div>
    </form>
  );
}
