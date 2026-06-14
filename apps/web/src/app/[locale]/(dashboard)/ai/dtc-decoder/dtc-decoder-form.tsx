"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { interpretDtcAction, type DtcDecoderState } from "@/lib/vehicle-intelligence/actions";
import type { VehicleDtcInterpretation } from "@/lib/vehicle-intelligence/types";
import { VehicleDtcResultsCard } from "@/components/vehicle-intelligence-result";
import { SubmitButton } from "@/components/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initial: DtcDecoderState = {};

export function DtcDecoderForm({
  initialVehicleId,
  vehicles,
}: {
  initialVehicleId?: string;
  vehicles: Array<{ id: string; detail: string; label: string }>;
}) {
  const t = useTranslations("vehicleIntelligence");
  const [state, action] = useActionState(interpretDtcAction, initial);
  const [vehicleId, setVehicleId] = useState(initialVehicleId ?? "");

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <form action={action} className="flex flex-col gap-4 rounded-xl border p-4">
        <div className="grid gap-2">
          <Label htmlFor="vehicle_id">{t("dtc.vehicleLabel")}</Label>
          <Select
            name="vehicle_id"
            value={vehicleId || "__none__"}
            onValueChange={(value) => setVehicleId(value && value !== "__none__" ? value : "")}
          >
            <SelectTrigger id="vehicle_id">
              <SelectValue placeholder={t("dtc.vehiclePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t("dtc.vehicleNone")}</SelectItem>
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

        <div className="grid gap-2">
          <Label htmlFor="codes">{t("dtc.label")}</Label>
          <Textarea
            id="codes"
            name="codes"
            rows={6}
            placeholder={t("dtc.placeholder")}
            required
          />
        </div>

        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}

        <div>
          <SubmitButton>{t("dtc.submit")}</SubmitButton>
        </div>
      </form>

      <div className="flex flex-col gap-4">
        {state.result ? (
          <VehicleDtcResultsCard codes={state.result.codes as VehicleDtcInterpretation[]} />
        ) : (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            {t("dtc.emptyState")}
          </div>
        )}
      </div>
    </div>
  );
}
