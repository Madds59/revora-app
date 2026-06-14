"use client";

import { ErrorState } from "@/components/error-state";

export default function VehicleDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6">
      <ErrorState
        title="Vehicle error"
        description="The vehicle detail page failed to load. Try again or go back to the list."
        errorDigest={error.digest}
        onRetry={reset}
        backHref="/vehicles"
        backLabel="Back to vehicles"
      />
    </div>
  );
}
