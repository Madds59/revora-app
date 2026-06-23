"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { submitPortalHealthCheckAction, type DiagnosisState } from "@/lib/vehicle-intelligence/actions";
import { VehicleDiagnosticCard } from "@/components/vehicle-intelligence-result";
import { SubmitButton } from "@/components/submit-button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initial: DiagnosisState = {};

export function PortalHealthCheckForm({
  initialVehicleId,
  vehicles,
}: {
  initialVehicleId?: string;
  vehicles: Array<{ customerId: string | null; detail: string; id: string; label: string }>;
}) {
  const t = useTranslations("vehicleIntelligence");
  const [state, action] = useActionState(submitPortalHealthCheckAction, initial);
  const [vehicleId, setVehicleId] = useState(initialVehicleId ?? "");
  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null,
    [vehicleId, vehicles],
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <form action={action} className="flex flex-col gap-4 rounded-xl border p-4">
        <div className="grid gap-2">
          <Label htmlFor="vehicle_id">{t("portal.vehicleLabel")}</Label>
          <Select
            name="vehicle_id"
            value={vehicleId || "__none__"}
            onValueChange={(value) => setVehicleId(value && value !== "__none__" ? value : "")}
          >
            <SelectTrigger id="vehicle_id">
              <SelectValue placeholder={t("portal.vehiclePlaceholder")}>
                {(value) =>
                  !value || value === "__none__"
                    ? t("portal.vehicleNone")
                    : (vehicles.find((vehicle) => vehicle.id === value)?.label ?? null)
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t("portal.vehicleNone")}</SelectItem>
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
          <Label htmlFor="symptoms">{t("portal.symptomsLabel")}</Label>
          <Textarea id="symptoms" name="symptoms" rows={5} placeholder={t("portal.symptomsPlaceholder")} required />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="warning_lights">{t("portal.warningLightsLabel")}</Label>
          <Input id="warning_lights" name="warning_lights" placeholder={t("portal.warningLightsPlaceholder")} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="driving_condition">{t("portal.drivingConditionLabel")}</Label>
          <Input id="driving_condition" name="driving_condition" placeholder={t("portal.drivingConditionPlaceholder")} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="mileage">{t("portal.mileageLabel")}</Label>
          <Input id="mileage" name="mileage" inputMode="numeric" placeholder="125000" />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="severity_input">{t("portal.severityLabel")}</Label>
          <Select name="severity_input" defaultValue="">
            <SelectTrigger id="severity_input">
              <SelectValue placeholder={t("portal.severityPlaceholder")}>
                {(value) =>
                  value === "low"
                    ? t("portal.severity.low")
                    : value === "medium"
                      ? t("portal.severity.medium")
                      : value === "high"
                        ? t("portal.severity.high")
                        : value === "critical"
                          ? t("portal.severity.critical")
                          : t("portal.severityPlaceholder")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t("portal.severityPlaceholder")}</SelectItem>
              <SelectItem value="low">{t("portal.severity.low")}</SelectItem>
              <SelectItem value="medium">{t("portal.severity.medium")}</SelectItem>
              <SelectItem value="high">{t("portal.severity.high")}</SelectItem>
              <SelectItem value="critical">{t("portal.severity.critical")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}

        <div>
          <SubmitButton disabled={!vehicleId}>{t("portal.submit")}</SubmitButton>
        </div>
      </form>

      <div className="flex flex-col gap-4">
        {state.result ? (
          <VehicleDiagnosticCard
            aiUsed={state.result.aiUsed}
            advisorSummary={null}
            customerExplanation={state.result.customerExplanation}
            diagnostic={state.result.diagnostic}
            maintenancePlan={state.result.maintenancePlan}
            quoteDraftEligible={false}
          />
        ) : (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            {t("portal.emptyState")}
          </div>
        )}
      </div>
    </div>
  );
}
