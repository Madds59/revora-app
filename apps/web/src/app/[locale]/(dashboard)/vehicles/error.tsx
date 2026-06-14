"use client";

import { ErrorState } from "@/components/error-state";

export default function VehiclesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6">
      <ErrorState
        title="Vehicles error"
        description="Vehicle management could not be loaded. Try again or return to the dashboard."
        errorDigest={error.digest}
        onRetry={reset}
        backHref="/"
        backLabel="Go to dashboard"
      />
    </div>
  );
}
