"use client";

import { ErrorState } from "@/components/error-state";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6">
      <ErrorState
        title="Dashboard error"
        description="The business dashboard failed to load. Try again or return to the home screen."
        errorDigest={error.digest}
        onRetry={reset}
        backHref="/"
        backLabel="Go to dashboard"
      />
    </div>
  );
}
