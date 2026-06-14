"use client";

import { useActionState, useEffect, useMemo, useRef } from "react";
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
import type { Vehicle } from "@/lib/database.types";

export type VehicleFormState = { error?: string; message?: string };
export type VehicleFormAction = (
  prev: VehicleFormState,
  formData: FormData,
) => Promise<VehicleFormState>;

export type VehicleCustomerOption = {
  id: string;
  label: string;
  detail?: string;
};

const initial: VehicleFormState = {};

export function VehicleForm({
  action,
  submitLabel,
  customers,
  vehicle,
  selectedCustomerId,
  lockCustomerSelection = false,
}: {
  action: VehicleFormAction;
  customers: VehicleCustomerOption[];
  lockCustomerSelection?: boolean;
  selectedCustomerId?: string;
  submitLabel: string;
  vehicle?: Pick<Vehicle, "id" | "customer_id" | "make" | "model" | "year" | "plate_number" | "vin" | "color">;
}) {
  const [state, formAction] = useActionState(action, initial);
  const lastMessage = useRef<string | undefined>(undefined);
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === (selectedCustomerId ?? vehicle?.customer_id)) ?? null,
    [customers, selectedCustomerId, vehicle?.customer_id],
  );
  const customerSelectionLocked =
    lockCustomerSelection && !!(selectedCustomerId ?? vehicle?.customer_id);
  const showCustomerSelect = !customerSelectionLocked && customers.length > 0;

  useEffect(() => {
    if (state.message && state.message !== lastMessage.current) {
      lastMessage.current = state.message;
      toast.success(state.message);
    }
    if (state.error && state.error !== lastMessage.current) {
      lastMessage.current = state.error;
      toast.error(state.error);
    }
  }, [state.error, state.message]);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      {vehicle && <input type="hidden" name="id" value={vehicle.id} />}
      {selectedCustomerId && lockCustomerSelection && (
        <input type="hidden" name="customer_id" value={selectedCustomerId} />
      )}

      {showCustomerSelect && (
        <div className="grid gap-2">
          <Label htmlFor="customer_id">Customer</Label>
          <Select
            name="customer_id"
            required
            defaultValue={selectedCustomerId ?? vehicle?.customer_id ?? ""}
          >
            <SelectTrigger id="customer_id" className="w-full">
              <SelectValue placeholder="Select a customer" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {selectedCustomer && customerSelectionLocked && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            Customer
          </div>
          <div className="mt-1 font-medium">{selectedCustomer.label}</div>
          {selectedCustomer.detail && (
            <div className="text-muted-foreground text-xs">{selectedCustomer.detail}</div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="make">Make</Label>
          <Input id="make" name="make" defaultValue={vehicle?.make ?? ""} placeholder="Toyota" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="model">Model</Label>
          <Input id="model" name="model" defaultValue={vehicle?.model ?? ""} placeholder="Land Cruiser" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="year">Year</Label>
          <Input
            id="year"
            name="year"
            inputMode="numeric"
            defaultValue={vehicle?.year?.toString() ?? ""}
            placeholder="2022"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="plate_number">Plate number</Label>
          <Input id="plate_number" name="plate_number" defaultValue={vehicle?.plate_number ?? ""} placeholder="A 12345" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="vin">VIN</Label>
          <Input id="vin" name="vin" defaultValue={vehicle?.vin ?? ""} placeholder="JTEBU5JR9J5A12345" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="color">Color</Label>
          <Input id="color" name="color" defaultValue={vehicle?.color ?? ""} placeholder="White" />
        </div>
      </div>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
      <div>
        <SubmitButton disabled={customers.length === 0}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
