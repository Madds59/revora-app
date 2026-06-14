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
      title="Notifications failed to load"
      description="The tenant notification center could not finish loading. Retry or go back to the dashboard."
      errorDigest={error.digest}
      onRetry={reset}
      backHref="/"
      backLabel="Back to dashboard"
    />
  );
}
