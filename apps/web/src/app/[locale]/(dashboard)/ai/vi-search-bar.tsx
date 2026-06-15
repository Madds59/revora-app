"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import {
  routeVehicleIntelligenceSearchAction,
  type ViSearchState,
} from "@/lib/vehicle-intelligence/actions";

const initial: ViSearchState = {};

const INPUT_LABEL_KEYS = {
  vehicle: "inputs.vehicle",
  symptoms: "inputs.symptoms",
  warningLights: "inputs.warningLights",
  drivingCondition: "inputs.drivingCondition",
  mileage: "inputs.mileage",
  vin: "inputs.vin",
  codes: "inputs.codes",
} as const;

const NEXT_STEP_LABEL_KEYS = {
  captureVehicle: "nextSteps.captureVehicle",
  captureSymptoms: "nextSteps.captureSymptoms",
  captureWarnings: "nextSteps.captureWarnings",
  captureDrivingCondition: "nextSteps.captureDrivingCondition",
  captureMileage: "nextSteps.captureMileage",
  captureVin: "nextSteps.captureVin",
  captureCodes: "nextSteps.captureCodes",
  reviewSafety: "nextSteps.reviewSafety",
  openDiagnosis: "nextSteps.openDiagnosis",
  openVin: "nextSteps.openVin",
  openDtc: "nextSteps.openDtc",
} as const;

export function VehicleIntelligenceSearchBar() {
  const t = useTranslations("viSearch");
  const locale = useLocale();
  const [state, action] = useActionState(routeVehicleIntelligenceSearchAction, initial);

  const result = state.result;

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <Card className="h-full">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="grid gap-4">
            <input type="hidden" name="locale" value={locale} />
            <div className="grid gap-2">
              <Label htmlFor="vi-search-query">{t("queryLabel")}</Label>
              <Input
                id="vi-search-query"
                name="query"
                placeholder={t("placeholder")}
                autoComplete="off"
                required
              />
            </div>

            {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}

            <SubmitButton>{t("submit")}</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card className="h-full">
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {result ? (
              <>
                <Badge variant={result.aiUsed ? "default" : "secondary"}>
                  {t(result.aiUsed ? "result.aiAssisted" : "result.ruleBased")}
                </Badge>
                <Badge variant="outline">{t(`tools.${result.tool}.title`)}</Badge>
                <Badge variant="outline">{t(`severity.${result.safety.severity}`)}</Badge>
              </>
            ) : null}
          </div>
          <CardTitle>{t("result.title")}</CardTitle>
          <CardDescription>
            {result
              ? result.assistantSummary ?? t(`tools.${result.tool}.description`)
              : t("emptyState")}
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-5">
          {result ? (
            <>
              <div className="grid gap-2 text-sm">
                <div className="text-muted-foreground">{t("result.queryLabel")}</div>
                <div className="rounded-lg border bg-muted/30 px-3 py-2">{result.query}</div>
              </div>

              <div className="grid gap-2 text-sm">
                <div className="text-muted-foreground">{t("result.inputsTitle")}</div>
                <div className="flex flex-wrap gap-2">
                  {result.requiredInputs.map((inputKey) => (
                    <Badge key={inputKey} variant="secondary">
                      {t(INPUT_LABEL_KEYS[inputKey as keyof typeof INPUT_LABEL_KEYS])}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid gap-2 text-sm">
                <div className="text-muted-foreground">{t("result.nextStepsTitle")}</div>
                <ul className="list-disc space-y-1 ps-5">
                  {result.nextSteps.map((stepKey) => (
                    <li key={stepKey}>
                      {t(NEXT_STEP_LABEL_KEYS[stepKey as keyof typeof NEXT_STEP_LABEL_KEYS])}
                    </li>
                  ))}
                </ul>
              </div>

              <div
                className={
                  result.safety.stopDrivingWarning
                    ? "rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
                    : "rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground"
                }
              >
                <div className="font-medium">{t("result.safetyTitle")}</div>
                <p className="mt-1">
                  {result.safety.stopDrivingWarning ? t("result.stopDriving") : t("result.advisory")}
                </p>
              </div>

              <div>
                <Link href={`/${locale}${result.route}`} className={buttonVariants({ variant: "secondary" })}>
                  {t("result.openTool")}
                </Link>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              {t("emptyState")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
