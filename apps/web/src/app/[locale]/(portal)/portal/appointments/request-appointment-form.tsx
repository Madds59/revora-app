"use client";

import { useActionState, useMemo, useState } from "react";

import { requestAppointment, type FormState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AccountOption = {
  customerId: string;
  businessId: string;
  label: string;
  branches: { id: string; name: string }[];
  vehicles: { id: string; label: string }[];
};

const initial: FormState = {};

// See appointment-controls.tsx for why Dubai time is stamped explicitly:
// a datetime-local input carries no offset, and Revora's businesses are
// UAE-based (Asia/Dubai, UTC+04:00 year-round).
const DUBAI_OFFSET = "+04:00";

export function RequestAppointmentForm({ accounts }: { accounts: AccountOption[] }) {
  const [state, action] = useActionState(requestAppointment, initial);
  const [accountIndex, setAccountIndex] = useState(0);
  const [branchId, setBranchId] = useState(accounts[0]?.branches[0]?.id ?? "");
  const [vehicleId, setVehicleId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const account = accounts[accountIndex];
  const branches = useMemo(() => account?.branches ?? [], [account]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="customer_id" value={account?.customerId ?? ""} />
      <input type="hidden" name="business_id" value={account?.businessId ?? ""} />
      <input type="hidden" name="branch_id" value={branchId} />
      <input type="hidden" name="vehicle_id" value={vehicleId} />
      <input type="hidden" name="requested_start" value={start ? `${start}:00${DUBAI_OFFSET}` : ""} />
      <input type="hidden" name="requested_end" value={end ? `${end}:00${DUBAI_OFFSET}` : ""} />

      {accounts.length > 1 && (
        <div className="grid gap-2">
          <Label>Workshop</Label>
          <Select
            value={String(accountIndex)}
            onValueChange={(v) => {
              const idx = Number(v);
              setAccountIndex(idx);
              setBranchId(accounts[idx]?.branches[0]?.id ?? "");
              setVehicleId("");
            }}
          >
            <SelectTrigger>
              <SelectValue>{() => account?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a, idx) => (
                <SelectItem key={a.customerId} value={String(idx)}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {branches.length > 1 && (
        <div className="grid gap-2">
          <Label>Branch</Label>
          <Select value={branchId} onValueChange={(v) => setBranchId(v ?? "")}>
            <SelectTrigger>
              <SelectValue>{() => branches.find((b) => b.id === branchId)?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(account?.vehicles.length ?? 0) > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="vehicle">Vehicle (optional)</Label>
          <Select value={vehicleId} onValueChange={(v) => setVehicleId(v ?? "")}>
            <SelectTrigger id="vehicle">
              <SelectValue placeholder="Not sure yet">
                {() => account?.vehicles.find((v) => v.id === vehicleId)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {account?.vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="req-start">Preferred start (workshop time, UAE)</Label>
          <Input
            id="req-start"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="req-end">Preferred end</Label>
          <Input
            id="req-end"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="notes">What do you need? (optional)</Label>
        <Textarea id="notes" name="notes" rows={3} placeholder="e.g. brake noise, oil change" />
      </div>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton>Request appointment</SubmitButton>
      </div>
    </form>
  );
}
