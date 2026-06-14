"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/formatters";
import type {
  VehicleDiagnosticJson,
  VehicleMaintenancePlan,
  VehicleVinDecode,
  VehicleDtcInterpretation,
} from "@/lib/vehicle-intelligence/types";
import { AlertTriangle, CheckCircle2, ShieldAlert, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";

const SEVERITY_VARIANT: Record<
  VehicleDiagnosticJson["severity"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  critical: "destructive",
};

export function VehicleVinDecodeCard({ decode }: { decode: VehicleVinDecode }) {
  const t = useTranslations("vehicleIntelligence");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("result.vinTitle")}</CardTitle>
        <CardDescription>
          {decode.status === "decoded"
            ? t("result.decodedSuccessfully")
            : decode.notes[0] ?? t("result.decodeUnavailable")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {[
          ["VIN", decode.vin],
          ["Make", decode.make ?? "—"],
          ["Model", decode.model ?? "—"],
          ["Year", decode.year ?? "—"],
          ["Trim", decode.trim ?? "—"],
          ["Body class", decode.bodyClass ?? "—"],
          ["Engine", decode.engine ?? "—"],
          ["Fuel type", decode.fuelType ?? "—"],
          ["Drive type", decode.driveType ?? "—"],
          ["Transmission", decode.transmission ?? "—"],
          ["Manufacturer", decode.manufacturer ?? "—"],
          ["Source", decode.decodeSource],
        ].map(([label, value]) => (
          <div key={label} className="space-y-1">
            <div className="text-muted-foreground text-xs uppercase tracking-wide">{label}</div>
            <div className="text-sm">{value}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function VehicleDiagnosticCard({
  diagnostic,
  customerExplanation,
  advisorSummary,
  maintenancePlan,
  aiUsed,
  quoteDraftEligible,
  action,
}: {
  action?: React.ReactNode;
  advisorSummary?: string | null;
  aiUsed: boolean;
  customerExplanation?: string | null;
  diagnostic: VehicleDiagnosticJson;
  maintenancePlan?: VehicleMaintenancePlan | null;
  quoteDraftEligible?: boolean;
}) {
  const t = useTranslations("vehicleIntelligence");
  return (
    <div className="grid gap-4">
      <Card className={diagnostic.stopDrivingWarning ? "border-destructive/40" : undefined}>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                {diagnostic.stopDrivingWarning ? (
                  <AlertTriangle className="text-destructive size-5" />
                ) : (
                  <ShieldAlert className="text-primary size-5" />
                )}
                {t("result.diagnosticTitle")}
              </CardTitle>
              <CardDescription>
                {aiUsed ? t("result.aiAssisted") : t("result.ruleBased")}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={SEVERITY_VARIANT[diagnostic.severity]}>{diagnostic.severity}</Badge>
              <Badge variant={quoteDraftEligible ? "secondary" : "outline"}>
                {quoteDraftEligible
                  ? t("result.quoteDraftEligible")
                  : t("result.advisorReviewRequired")}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6">
          {diagnostic.stopDrivingWarning && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              {t("result.stopDrivingWarning")}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-3">
              <div className="text-sm font-medium">{t("result.possibleCauses")}</div>
              <div className="flex flex-col gap-2">
                {diagnostic.possibleCauses.map((cause) => (
                  <div key={cause.cause} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{cause.cause}</div>
                      <Badge variant="outline">{Math.round(cause.confidence * 100)}%</Badge>
                    </div>
                    <p className="text-muted-foreground mt-2 text-sm leading-6">{cause.explanation}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-sm font-medium">{t("result.recommendedActions")}</div>
              <ul className="space-y-2 text-sm leading-6">
                {diagnostic.recommendedActions.map((action) => (
                  <li key={action} className="flex gap-2">
                    <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" />
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {diagnostic.safeSelfCheckSteps.length > 0 && (
            <section className="space-y-3">
              <div className="text-sm font-medium">{t("result.safeSelfCheckSteps")}</div>
              <ul className="space-y-2 text-sm leading-6">
                {diagnostic.safeSelfCheckSteps.map((step) => (
                  <li key={step} className="flex gap-2">
                    <Wrench className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">{t("result.serviceCategory")}</dt>
              <dd className="text-sm">{diagnostic.suggestedServiceCategory}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">{t("result.inspectionTime")}</dt>
              <dd className="text-sm tabular-nums">{diagnostic.estimatedInspectionMinutes} min</dd>
            </div>
          </dl>

          {customerExplanation && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-sm font-medium">{t("result.customerExplanation")}</div>
              <p className="text-muted-foreground mt-2 text-sm leading-6">{customerExplanation}</p>
            </div>
          )}

          {advisorSummary && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-sm font-medium">{t("result.advisorSummary")}</div>
              <pre className="text-muted-foreground mt-2 overflow-auto text-xs leading-6 whitespace-pre-wrap">
                {advisorSummary}
              </pre>
            </div>
          )}

          {maintenancePlan && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Wrench className="text-primary size-4" />
                {t("result.maintenancePlan")}
              </div>
              <p className="text-muted-foreground mt-2 text-sm leading-6">{maintenancePlan.summary}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {maintenancePlan.items.map((item) => (
                  <div key={item.title} className="rounded-lg border bg-background p-3">
                    <div className="font-medium">{item.title}</div>
                    <div className="text-muted-foreground text-xs">{item.interval}</div>
                    <p className="text-muted-foreground mt-2 text-sm leading-6">{item.rationale}</p>
                  </div>
                ))}
              </div>
              <div className="text-muted-foreground mt-3 text-xs">
                {maintenancePlan.nextServiceDate
                ? `${t("result.nextServiceDate")}: ${formatDate(maintenancePlan.nextServiceDate)}`
                  : `${t("result.nextServiceDate")}: —`}
              </div>
            </div>
          )}

          {action && <div className="flex flex-wrap gap-2">{action}</div>}
        </CardContent>
      </Card>
    </div>
  );
}

export function VehicleDtcResultsCard({
  codes,
}: {
  codes: Array<VehicleDtcInterpretation | undefined>;
}) {
  const t = useTranslations("vehicleIntelligence");
  const visibleCodes = codes.filter(
    (entry): entry is VehicleDtcInterpretation => Boolean(entry),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("result.dtcTitle")}</CardTitle>
        <CardDescription>{t("result.structuredInterpretation")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {visibleCodes.map((entry) => (
          <div key={entry.code} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="font-medium">{entry.code} · {entry.title}</div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={SEVERITY_VARIANT[entry.severity]}>{entry.severity}</Badge>
                {entry.stopDrivingWarning && <Badge variant="destructive">{t("result.stopDriving")}</Badge>}
                </div>
              </div>
            <p className="text-muted-foreground mt-2 text-sm leading-6">{entry.description}</p>
            <p className="text-muted-foreground mt-2 text-sm leading-6">{entry.explanation}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {entry.recommendedActions.map((item) => (
                <Badge key={item} variant="outline">{item}</Badge>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
