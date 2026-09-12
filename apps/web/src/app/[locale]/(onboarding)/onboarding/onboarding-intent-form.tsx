"use client";

import { useTranslations } from "next-intl";

import { useActionState, useState } from "react";

import { saveOnboardingIntent, type OnboardingState } from "./actions";
import { AccountIntentPicker } from "@/components/account-intent-picker";
import { SubmitButton } from "@/components/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AccountIntent } from "@/lib/account-intent";

const initial: OnboardingState = {};

export function OnboardingIntentForm() {
  const t = useTranslations("onboarding.intent");
  const [state, action] = useActionState(saveOnboardingIntent, initial);
  const [accountIntent, setAccountIntent] = useState<AccountIntent | null>(
    null,
  );

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("cardDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <AccountIntentPicker
            value={accountIntent}
            onChange={setAccountIntent}
          />
          <input type="hidden" name="account_intent" value={accountIntent ?? ""} />
          <p className="text-muted-foreground text-xs">
            {t("note")}
          </p>
          {state.error && (
            <p role="alert" className="text-destructive text-sm">{state.error}</p>
          )}
          <SubmitButton className="w-full" disabled={!accountIntent}>
            {t("continue")}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
