"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";

import { requestPasswordReset, type AuthState } from "../actions";
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

export function ForgotPasswordClient() {
  const [state, action] = useActionState(requestPasswordReset, initial);
  const locale = useLocale();
  const t = useTranslations("auth.forgotPassword");

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">{t("emailLabel")}</Label>
            <Input id="email" name="email" type="email" required />
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
