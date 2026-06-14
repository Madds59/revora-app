"use client";

import { ErrorState } from "@/components/error-state";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Analytics failed to load"
      description="The tenant analytics screen could not finish loading. Retry or return to the dashboard."
      errorDigest={error.digest}
      onRetry={reset}
      backHref="/"
      backLabel="Back to dashboard"
    />
  );
}
