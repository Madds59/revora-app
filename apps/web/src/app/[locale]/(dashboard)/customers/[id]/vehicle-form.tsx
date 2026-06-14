import { getTranslations } from "next-intl/server";

import { VehicleForm } from "@/components/vehicle-form";
import { addVehicle } from "../actions";

export async function AddVehicleForm({ customerId }: { customerId: string }) {
  const [tDetail, tVehicle] = await Promise.all([
    getTranslations("dashboardCustomers.detail"),
    getTranslations("forms.vehicle"),
  ]);
  return (
    <VehicleForm
      action={addVehicle}
      lockCustomerSelection
      submitLabel={tDetail("addVehicleSubmit")}
      selectedCustomerId={customerId}
      customers={[{ id: customerId, label: tVehicle("selectedCustomer") }]}
    />
  );
}
