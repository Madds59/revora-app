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
      title="Documents failed to load"
      description="The portal documents list could not finish loading. Retry or return to the portal home."
      errorDigest={error.digest}
      onRetry={reset}
      backHref="/portal"
      backLabel="Back to portal"
    />
  );
}
