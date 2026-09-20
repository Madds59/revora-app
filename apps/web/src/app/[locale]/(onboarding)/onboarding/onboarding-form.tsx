"use client";

import { useTranslations } from "next-intl";

import { useActionState } from "react";

import { createBusiness, type OnboardingState } from "./actions";
import { DraftRestoredBanner } from "@/components/draft-restored-banner";
import { SubmitButton } from "@/components/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormDraft } from "@/hooks/use-form-draft";

const initial: OnboardingState = {};

export function OnboardingForm({
  defaultName,
  email,
  userId,
}: {
  defaultName: string;
  email: string;
  userId: string;
}) {
  const t = useTranslations("onboarding.owner");
  const [state, action] = useActionState(createBusiness, initial);
  const draft = useFormDraft({ key: "onboarding", scope: userId, error: state.error });

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={draft.ref} action={action} className="flex flex-col gap-4">
          {draft.restored && <DraftRestoredBanner savedAt={draft.savedAt} onDiscard={draft.discard} />}
          <div className="grid gap-2">
            <Label htmlFor="name">{t("businessName")}</Label>
            <Input
              id="name"
              name="name"
              type="text"
              placeholder={t("businessNamePlaceholder")}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="full_name">{t("yourName")}</Label>
            <Input
              id="full_name"
              name="full_name"
              type="text"
              defaultValue={defaultName}
            />
            <p className="text-muted-foreground text-xs">
              {t("signedInAs", { email })}
            </p>
          </div>
          {state.error && (
            <p role="alert" className="text-destructive text-sm">{state.error}</p>
          )}
          <SubmitButton className="w-full">
            {t("submit")}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
