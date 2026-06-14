"use client";

import { ErrorState } from "@/components/error-state";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6">
      <ErrorState
        title="Portal error"
        description="The customer portal failed to load. Try again or return to the portal home."
        errorDigest={error.digest}
        onRetry={reset}
        backHref="/portal"
        backLabel="Go to portal home"
      />
    </div>
  );
}
