"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  generateQuoteDraftAction,
  submitDiagnosisAction,
  type DiagnosisState,
} from "@/lib/vehicle-intelligence/actions";
import { VehicleDiagnosticCard } from "@/components/vehicle-intelligence-result";
import { SubmitButton } from "@/components/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initial: DiagnosisState = {};

export function VehicleDiagnosisForm({
  initialVehicleId,
  vehicles,
}: {
  initialVehicleId?: string;
  vehicles: Array<{ customerId: string | null; detail: string; id: string; label: string }>;
}) {
  const t = useTranslations("vehicleIntelligence");
  const [state, action] = useActionState(submitDiagnosisAction, initial);
  const [vehicleId, setVehicleId] = useState(initialVehicleId ?? "");
  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null,
    [vehicleId, vehicles],
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <form action={action} className="flex flex-col gap-4 rounded-xl border p-4">
        <div className="grid gap-2">
          <Label htmlFor="vehicle_id">{t("diagnosis.vehicleLabel")}</Label>
          <Select
            name="vehicle_id"
            value={vehicleId || "__none__"}
            onValueChange={(value) => setVehicleId(value && value !== "__none__" ? value : "")}
          >
            <SelectTrigger id="vehicle_id">
              <SelectValue placeholder={t("diagnosis.vehiclePlaceholder")}>
                {(value) =>
                  !value || value === "__none__"
                    ? t("diagnosis.vehicleNone")
                    : (vehicles.find((vehicle) => vehicle.id === value)?.label ?? null)
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t("diagnosis.vehicleNone")}</SelectItem>
              {vehicles.map((vehicle) => (
                <SelectItem key={vehicle.id} value={vehicle.id}>
                  <div className="grid">
                    <span>{vehicle.label}</span>
                    <span className="text-muted-foreground text-xs">{vehicle.detail}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedVehicle?.customerId && (
          <input type="hidden" name="customer_id" value={selectedVehicle.customerId} />
        )}

        <div className="grid gap-2">
          <Label htmlFor="symptoms">{t("diagnosis.symptomsLabel")}</Label>
          <Textarea
            id="symptoms"
            name="symptoms"
            rows={5}
            placeholder={t("diagnosis.symptomsPlaceholder")}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="warning_lights">{t("diagnosis.warningLightsLabel")}</Label>
          <Input id="warning_lights" name="warning_lights" placeholder={t("diagnosis.warningLightsPlaceholder")} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="driving_condition">{t("diagnosis.drivingConditionLabel")}</Label>
          <Input id="driving_condition" name="driving_condition" placeholder={t("diagnosis.drivingConditionPlaceholder")} />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="mileage">{t("diagnosis.mileageLabel")}</Label>
            <Input id="mileage" name="mileage" inputMode="numeric" placeholder="125000" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="severity_input">{t("diagnosis.severityLabel")}</Label>
            <Select name="severity_input" defaultValue="">
              <SelectTrigger id="severity_input">
                <SelectValue placeholder={t("diagnosis.severityPlaceholder")}>
                  {(value) =>
                    value === "low"
                      ? t("diagnosis.severity.low")
                      : value === "medium"
                        ? t("diagnosis.severity.medium")
                        : value === "high"
                          ? t("diagnosis.severity.high")
                          : value === "critical"
                            ? t("diagnosis.severity.critical")
                            : t("diagnosis.severityPlaceholder")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("diagnosis.severityPlaceholder")}</SelectItem>
                <SelectItem value="low">{t("diagnosis.severity.low")}</SelectItem>
                <SelectItem value="medium">{t("diagnosis.severity.medium")}</SelectItem>
                <SelectItem value="high">{t("diagnosis.severity.high")}</SelectItem>
                <SelectItem value="critical">{t("diagnosis.severity.critical")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="symptom_tags">{t("diagnosis.tagsLabel")}</Label>
          <Input id="symptom_tags" name="symptom_tags" placeholder={t("diagnosis.tagsPlaceholder")} />
        </div>

        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}

        <div>
          <SubmitButton disabled={!vehicleId}>{t("diagnosis.submit")}</SubmitButton>
        </div>
      </form>

      <div className="flex flex-col gap-4">
        {state.result ? (
          <>
            <VehicleDiagnosticCard
              aiUsed={state.result.aiUsed}
              advisorSummary={state.result.advisorSummary}
              customerExplanation={state.result.customerExplanation}
              diagnostic={state.result.diagnostic}
              maintenancePlan={state.result.maintenancePlan}
              quoteDraftEligible={state.result.quoteDraftEligible}
              action={
                state.result.quoteDraftEligible ? (
                  <form action={generateQuoteDraftAction}>
                    <input type="hidden" name="diagnostic_result_id" value={state.result.diagnosticResultId ?? ""} />
                    <SubmitButton variant="secondary">{t("diagnosis.quoteDraft")}</SubmitButton>
                  </form>
                ) : undefined
              }
            />
          </>
        ) : (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            {t("diagnosis.emptyState")}
          </div>
        )}
      </div>
    </div>
  );
}
