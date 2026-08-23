"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";

import { signOut, verifyMfaChallenge, type AuthState } from "../../actions";
import { switchLocalePath } from "@/lib/locale-path";
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

export type MfaChallengeFactor = {
  id: string;
  addedOnLabel: string;
};

const initial: AuthState = {};

export function MfaChallengeClient({
  factors,
  next,
}: {
  factors: MfaChallengeFactor[];
  next: string;
}) {
  const t = useTranslations("auth.mfa");
  const locale = useLocale();
  const [state, formAction] = useActionState(verifyMfaChallenge, initial);
  const multiple = factors.length > 1;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {factors.length === 0 ? t("noFactorDescription") : t("description")}
        </CardDescription>
      </CardHeader>

      {factors.length > 0 && (
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="next" value={next} />

            {multiple ? (
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">{t("chooseFactor")}</legend>
                {factors.map((factor, index) => (
                  <label
                    key={factor.id}
                    className="flex items-center gap-2 rounded-lg border p-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="factor_id"
                      value={factor.id}
                      defaultChecked={index === 0}
                    />
                    <span>{t("factorAddedOn", { date: factor.addedOnLabel })}</span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <>
                <input type="hidden" name="factor_id" value={factors[0].id} />
                <p className="text-muted-foreground text-sm">
                  {t("factorAddedOn", { date: factors[0].addedOnLabel })}
                </p>
              </>
            )}

            <div className="grid gap-2">
              <Label htmlFor="mfa-code">{t("codeLabel")}</Label>
              {/* Same input rules as the enrollment form (Task 6): digits-only
                  entry, never type="number" — spinners and locale digit
                  grouping break a code that must be typed verbatim. */}
              <Input
                id="mfa-code"
                name="code"
                required
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={6}
              />
            </div>

            {state.error && <p className="text-destructive text-sm">{state.error}</p>}
            <SubmitButton className="w-full">{t("verify")}</SubmitButton>
          </form>
        </CardContent>
      )}

      {/* Always reachable, in every branch: a user who lost their authenticator
          must be able to leave rather than be trapped on the gate page. */}
      <CardFooter className="flex-col items-start gap-2">
        {factors.length === 0 ? (
          // Reached when listFactors failed, or when the AAL lookup was
          // unreadable so the page rendered rather than redirecting. Sign-out
          // alone would make this a dead end — enrollment is the way forward,
          // and /settings/security is reachable by any authenticated user.
          <Link
            href={switchLocalePath("/settings/security", locale)}
            className="text-foreground text-sm underline"
          >
            {t("enrollLink")}
          </Link>
        ) : (
          <p className="text-muted-foreground text-sm">{t("lostDevice")}</p>
        )}
        <form action={signOut}>
          <button type="submit" className="text-foreground text-sm underline">
            {t("signOut")}
          </button>
        </form>
      </CardFooter>
    </Card>
  );
}
