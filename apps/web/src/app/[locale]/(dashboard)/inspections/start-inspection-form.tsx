"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InspectionContext } from "@/lib/database.types";

import { startInspection, type FormState } from "./actions";

const initial: FormState = {};

export type VehicleOption = {
  id: string;
  customerId: string;
  label: string;
  customerName: string;
};

export type TemplateOption = {
  id: string;
  name: string;
  isDefault: boolean;
};

/**
 * Start form for both entry points.
 *
 * `context` is derived, never chosen by the user: arriving with a job makes it
 * `in_job`, otherwise `pre_quote`. That mirrors the database CHECK
 * (`vehicle_inspections_context_anchor`), so the form cannot offer a
 * combination the database will reject.
 */
export function StartInspectionForm({
  vehicles,
  templates,
  jobId,
  appointmentId,
  lockedVehicleId,
}: {
  vehicles: VehicleOption[];
  templates: TemplateOption[];
  jobId?: string;
  appointmentId?: string;
  /** Preselected (and fixed) when arriving from a vehicle or a job. */
  lockedVehicleId?: string;
}) {
  const t = useTranslations("dashboardInspections.new");
  const tContext = useTranslations("inspections.context");
  const [state, action] = useActionState(startInspection, initial);
  const [vehicleId, setVehicleId] = useState(
    lockedVehicleId ?? vehicles[0]?.id ?? "",
  );
  const [templateId, setTemplateId] = useState(
    templates.find((tpl) => tpl.isDefault)?.id ?? templates[0]?.id ?? "",
  );
  const lastError = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.error && state.error !== lastError.current) {
      lastError.current = state.error;
      toast.error(state.error);
    }
  }, [state]);

  const context: InspectionContext = jobId ? "in_job" : "pre_quote";
  const selected = vehicles.find((v) => v.id === vehicleId);

  if (vehicles.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("noVehicles")}</p>;
  }

  return (
    <form action={action} className="max-w-xl space-y-5">
      {/* The base-nova Select submits nothing on its own, so every selected
          value is mirrored into a hidden input. */}
      <input type="hidden" name="vehicle_id" value={vehicleId} />
      <input type="hidden" name="customer_id" value={selected?.customerId ?? ""} />
      <input type="hidden" name="context" value={context} />
      <input type="hidden" name="template_id" value={templateId} />
      {jobId && <input type="hidden" name="job_id" value={jobId} />}
      {appointmentId && (
        <input type="hidden" name="appointment_id" value={appointmentId} />
      )}

      <div className="grid gap-2">
        <Label htmlFor="inspection-vehicle">{t("vehicle")}</Label>
        {lockedVehicleId ? (
          <p className="border-input bg-muted/40 rounded-md border px-3 py-2 text-sm">
            {selected?.label ?? ""}
          </p>
        ) : (
          <Select
            value={vehicleId}
            onValueChange={(v) => setVehicleId(v ?? vehicleId)}
          >
            <SelectTrigger id="inspection-vehicle">
              <SelectValue placeholder={t("selectVehicle")}>
                {(value) =>
                  vehicles.find((v) => v.id === value)?.label ?? null
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((vehicle) => (
                <SelectItem key={vehicle.id} value={vehicle.id}>
                  {vehicle.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid gap-2">
        <Label>{t("customer")}</Label>
        <p className="border-input bg-muted/40 rounded-md border px-3 py-2 text-sm">
          {selected?.customerName ?? ""}
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="inspection-template">{t("template")}</Label>
        <Select
          value={templateId}
          onValueChange={(v) => setTemplateId(v ?? templateId)}
        >
          <SelectTrigger id="inspection-template">
            <SelectValue placeholder={t("templateDefault")}>
              {(value) => templates.find((tpl) => tpl.id === value)?.name ?? null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="inspection-odometer">{t("odometer")}</Label>
        <Input
          id="inspection-odometer"
          name="odometer"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          placeholder={t("odometerHint")}
        />
      </div>

      <div className="grid gap-2">
        <Label>{t("contextLabel")}</Label>
        <p className="text-muted-foreground text-sm">
          {context === "in_job" ? tContext("inJob") : tContext("preQuote")}
        </p>
      </div>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}

      <SubmitButton disabled={!vehicleId}>{t("submit")}</SubmitButton>
    </form>
  );
}
