"use client";

import { ErrorState } from "@/components/error-state";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6">
      <ErrorState
        title="Admin error"
        description="The admin console failed to load. Try again or return to the platform home."
        errorDigest={error.digest}
        onRetry={reset}
        backHref="/admin"
        backLabel="Go to admin home"
      />
    </div>
  );
}
