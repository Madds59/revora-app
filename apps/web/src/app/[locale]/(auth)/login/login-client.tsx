"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { useActionState } from "react";

import { signIn, signInWithMagicLink, type AuthState } from "../actions";
import { buildForgotPasswordPath, buildSignupPath } from "@/lib/auth-links";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const initial: AuthState = {};

function FormMessage({ state }: { state: AuthState }) {
  if (state.error)
    return <p className="text-destructive text-sm">{state.error}</p>;
  if (state.message)
    return <p className="text-sm text-emerald-600">{state.message}</p>;
  return null;
}

export function LoginClient({
  passwordResetSuccess = false,
}: {
  passwordResetSuccess?: boolean;
}) {
  const [pwState, pwAction] = useActionState(signIn, initial);
  const [linkState, linkAction] = useActionState(signInWithMagicLink, initial);
  const locale = useLocale();
  const t = useTranslations("auth.login");

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {passwordResetSuccess && (
          <p className="text-sm text-emerald-600">{t("passwordResetSuccess")}</p>
        )}
        <Tabs defaultValue="password" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="password">{t("passwordTab")}</TabsTrigger>
            <TabsTrigger value="magic">{t("magicTab")}</TabsTrigger>
          </TabsList>

          <TabsContent value="password">
            <form action={pwAction} className="mt-4 flex flex-col gap-4">
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
                  required
                />
              </div>
              <div className="text-sm">
                <Link
                  href={buildForgotPasswordPath(locale as "en" | "ar")}
                  className="text-foreground underline"
                >
                  {t("forgotPassword")}
                </Link>
              </div>
              <FormMessage state={pwState} />
              <SubmitButton className="w-full">{t("signIn")}</SubmitButton>
            </form>
          </TabsContent>

          <TabsContent value="magic">
            <form action={linkAction} className="mt-4 flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="magic-email">{t("emailLabel")}</Label>
                <Input
                  id="magic-email"
                  name="email"
                  type="email"
                  required
                />
              </div>
              <FormMessage state={linkState} />
              <SubmitButton className="w-full" variant="secondary">
                {t("sendMagicLink")}
              </SubmitButton>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="text-muted-foreground text-sm">
        {t("noAccount")}{" "}
        <Link
          href={buildSignupPath(locale as "en" | "ar")}
          className="text-foreground ms-1 underline"
        >
          {t("createOne")}
        </Link>
      </CardFooter>
    </Card>
  );
}
