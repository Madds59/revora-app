"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { decodeVinAction, type VinDecoderState } from "@/lib/vehicle-intelligence/actions";
import { VehicleVinDecodeCard } from "@/components/vehicle-intelligence-result";
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
import { useTranslations } from "next-intl";
import type { VehicleVinDecode } from "@/lib/vehicle-intelligence/types";

const initial: VinDecoderState = {};

export function VinDecoderForm({
  initialVehicleId,
  vehicles,
}: {
  initialVehicleId?: string;
  vehicles: Array<{ id: string; detail: string; label: string }>;
}) {
  const t = useTranslations("vehicleIntelligence");
  const [state, action] = useActionState(decodeVinAction, initial);
  const [vehicleId, setVehicleId] = useState(initialVehicleId ?? "");
  const last = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.message && state.message !== last.current) {
      last.current = state.message;
    }
  }, [state.message]);

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <form action={action} className="flex flex-col gap-4 rounded-xl border p-4">
        <div className="grid gap-2">
          <Label htmlFor="vehicle_id">{t("vin.vehicleLabel")}</Label>
          <Select
            name="vehicle_id"
            value={vehicleId || "__none__"}
            onValueChange={(value) => setVehicleId(value && value !== "__none__" ? value : "")}
          >
            <SelectTrigger id="vehicle_id">
              <SelectValue placeholder={t("vin.vehiclePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t("vin.vehicleNone")}</SelectItem>
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
          <Label htmlFor="vin">{t("vin.label")}</Label>
          <Input id="vin" name="vin" placeholder={t("vin.placeholder")} required />
        </div>

        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}

        <div>
          <SubmitButton disabled={!vehicleId && vehicles.length > 0}>{t("vin.submit")}</SubmitButton>
        </div>
      </form>

      <div className="flex flex-col gap-4">
        {state.result ? (
          <VehicleVinDecodeCard decode={state.result.decode as VehicleVinDecode} />
        ) : (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            {t("vin.emptyState")}
          </div>
        )}
      </div>
    </div>
  );
}
