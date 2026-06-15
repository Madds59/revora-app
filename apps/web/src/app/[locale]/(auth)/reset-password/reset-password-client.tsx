"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";

import { updatePassword, type AuthState } from "../actions";
import { buildLoginPath } from "@/lib/auth-links";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AuthState = {};

function FormMessage({ state }: { state: AuthState }) {
  if (state.error) return <p className="text-destructive text-sm">{state.error}</p>;
  if (state.message) return <p className="text-sm text-emerald-600">{state.message}</p>;
  return null;
}

export function ResetPasswordClient() {
  const [state, action] = useActionState(updatePassword, initial);
  const locale = useLocale();
  const t = useTranslations("auth.resetPassword");

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="password">{t("passwordLabel")}</Label>
            <Input id="password" name="password" type="password" minLength={8} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm_password">{t("confirmPasswordLabel")}</Label>
            <Input id="confirm_password" name="confirm_password" type="password" minLength={8} required />
          </div>
          <FormMessage state={state} />
          <SubmitButton className="w-full">{t("submit")}</SubmitButton>
        </form>
      </CardContent>
      <CardFooter className="text-muted-foreground text-sm">
        <Link href={buildLoginPath(locale as "en" | "ar")} className="text-foreground underline">
          {t("backToSignIn")}
        </Link>
      </CardFooter>
    </Card>
  );
}
