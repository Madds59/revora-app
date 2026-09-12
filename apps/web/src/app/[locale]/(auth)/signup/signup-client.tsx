"use client";

import Link from "next/link";
import { Link as LocaleLink } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { signUp, type AuthState } from "../actions";
import { AccountIntentPicker } from "@/components/account-intent-picker";
import { SubmitButton } from "@/components/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AccountIntent } from "@/lib/account-intent";

const initial: AuthState = {};

export function SignupClient() {
  const [state, action] = useActionState(signUp, initial);
  const [accountIntent, setAccountIntent] = useState<AccountIntent | null>(
    null,
  );
  const t = useTranslations("auth.signup");

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="grid gap-3">
            <AccountIntentPicker
              value={accountIntent}
              onChange={setAccountIntent}
            />
            <input
              type="hidden"
              name="account_intent"
              value={accountIntent ?? ""}
            />
            <p className="text-muted-foreground text-xs">
              {t("superAdminNote")}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="full_name">{t("fullNameLabel")}</Label>
            <Input id="full_name" name="full_name" type="text" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">{t("emailLabel")}</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">{t("passwordLabel")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              minLength={8}
              required
            />
          </div>
          <div className="grid gap-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="accept_terms"
                required
                className="accent-primary mt-0.5 size-4 shrink-0"
              />
              <span>
                {t("acceptTermsPrefix")}{" "}
                <LocaleLink href="/legal/terms" target="_blank" className="underline underline-offset-4">
                  {t("termsLink")}
                </LocaleLink>{" "}
                {t("acceptTermsAnd")}{" "}
                <LocaleLink href="/legal/privacy" target="_blank" className="underline underline-offset-4">
                  {t("privacyLink")}
                </LocaleLink>
                .
              </span>
            </label>
            <p className="text-muted-foreground text-xs">{t("ageNote")}</p>
          </div>
          {state.error && (
            <p role="alert" className="text-destructive text-sm">{state.error}</p>
          )}
          {state.message && (
            <p role="status" className="text-primary text-sm">{state.message}</p>
          )}
          <SubmitButton className="w-full" disabled={!accountIntent}>
            {t("createAccount")}
          </SubmitButton>
        </form>
      </CardContent>
      <CardFooter className="text-muted-foreground text-sm">
        {t("haveAccount")}{" "}
        <Link href="/login" className="text-foreground ms-1 underline">
          {t("signIn")}
        </Link>
      </CardFooter>
    </Card>
  );
}
