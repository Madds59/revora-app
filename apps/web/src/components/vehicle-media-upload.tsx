"use client";

import { FileUpload } from "@/components/file-upload";
import { uploadVehicleMediaAction } from "@/lib/vehicle-intelligence/actions";

export function VehicleMediaUpload({
  businessId,
  vehicleId,
  customerId,
}: {
  businessId: string;
  customerId?: string | null;
  vehicleId: string;
}) {
  return (
    <FileUpload
      bucket="revora-private"
      businessId={businessId}
      entity={`vehicles/${vehicleId}/media`}
      accept="image/*,video/*,.pdf,.doc,.docx"
      label="Upload media"
      onUpload={async (formData) => {
        formData.set("vehicle_id", vehicleId);
        formData.set("customer_id", customerId ?? "");
        formData.set("storage_bucket", "revora-private");
        formData.set("media_type", "image");
        const result = await uploadVehicleMediaAction({}, formData);
        return {
          error: result.error,
          message: result.message,
        };
      }}
    />
  );
}

