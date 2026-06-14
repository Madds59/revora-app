import { VehicleForm } from "@/components/vehicle-form";
import { addVehicle } from "../actions";

export function AddVehicleForm({ customerId }: { customerId: string }) {
  return (
    <VehicleForm
      action={addVehicle}
      lockCustomerSelection
      submitLabel="Add vehicle"
      selectedCustomerId={customerId}
      customers={[{ id: customerId, label: "Selected customer" }]}
    />
  );
}
