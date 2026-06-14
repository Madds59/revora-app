"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

import { BrandState } from "@/components/brand-state";
import { Button, buttonVariants } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for diagnostics; replace with Sentry/PostHog capture later.
    console.error(error);
  }, [error]);

  return (
    <BrandState
      code="Something went wrong"
      title="That didn't work as expected"
      description="An unexpected error occurred. You can try again, or head back to safety. If it keeps happening, please let the team know."
    >
      <Button onClick={reset}>
        <RotateCcw />
        Try again
      </Button>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Back to dashboard
      </Link>
      {error.digest && (
        <p className="text-muted-foreground/70 mt-1 w-full text-xs">
          Reference: {error.digest}
        </p>
      )}
    </BrandState>
  );
}
