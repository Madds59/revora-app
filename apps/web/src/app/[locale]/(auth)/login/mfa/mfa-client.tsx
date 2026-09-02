"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";

import { signOut, verifyMfaChallenge, type AuthState } from "../../actions";
import { switchLocalePath } from "@/lib/locale-path";
import { MFA_ENROLLMENT_PATH } from "@/lib/mfa-gate";
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

/**
 * `mode` is decided on the server by `challengePageMode` (lib/mfa-gate.js) and
 * passed in rather than re-derived from `factors.length` here — an empty list
 * means "you have no authenticator" or "we could not load your authenticator",
 * and only the server saw the AAL read that tells them apart.
 */
const DESCRIPTION_KEY = {
  challenge: "description",
  unavailable: "unavailableDescription",
  enroll: "noFactorDescription",
} as const;

export function MfaChallengeClient({
  factors,
  mode,
  next,
  retryHref,
}: {
  factors: MfaChallengeFactor[];
  mode: "challenge" | "unavailable" | "enroll";
  next: string;
  retryHref: string;
}) {
  const t = useTranslations("auth.mfa");
  const locale = useLocale();
  const [state, formAction] = useActionState(verifyMfaChallenge, initial);
  const multiple = factors.length > 1;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t(DESCRIPTION_KEY[mode])}</CardDescription>
      </CardHeader>

      {mode === "challenge" && factors.length > 0 && (
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
        {mode === "enroll" && (
          // No verified factor exists (or the AAL read failed outright), so
          // enrollment is both the right advice and an actually reachable
          // destination: with no verified factor, the gate's rule 2 cannot
          // fire on /settings/security.
          <Link
            href={switchLocalePath(MFA_ENROLLMENT_PATH, locale)}
            className="text-foreground text-sm underline"
          >
            {t("enrollLink")}
          </Link>
        )}
        {mode === "unavailable" && (
          // A verified factor DOES exist; listFactors just failed. Never link
          // to enrollment here — the copy would be false, and the gate would
          // bounce /settings/security straight back to this page. Retry is the
          // only honest affordance; sign-out below is the escape.
          <a href={retryHref} className="text-foreground text-sm underline">
            {t("retry")}
          </a>
        )}
        {mode === "challenge" && (
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
