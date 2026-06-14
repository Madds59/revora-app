"use client";

import { ErrorState } from "@/components/error-state";

export default function EditVehicleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6">
      <ErrorState
        title="Edit vehicle error"
        description="The vehicle edit form failed to load. Try again or return to the vehicle list."
        errorDigest={error.digest}
        onRetry={reset}
        backHref="/vehicles"
        backLabel="Back to vehicles"
      />
    </div>
  );
}
