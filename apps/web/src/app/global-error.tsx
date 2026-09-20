"use client";

import { useEffect } from "react";

import "./globals.css";
import { BrandState } from "@/components/brand-state";
import { buttonVariants } from "@/components/ui/button";
import { reportError } from "@/lib/observability";

// global-error replaces the root layout, so it must render its own <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { section: "global", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body className="antialiased">
        <BrandState
          code="Revora didn't load"
          title="Revora didn't load this time"
          description="Something stopped the app from starting. Nothing was lost — your data is safe on the server. Reload to pick up where you were."
        >
          <button
            type="button"
            onClick={reset}
            className={buttonVariants()}
          >
            Reload Revora
          </button>
          {error.digest && (
            <p className="text-muted-foreground/70 mt-1 w-full text-xs">
              Send us reference {error.digest} and we&apos;ll fix it fast.
            </p>
          )}
        </BrandState>
      </body>
    </html>
  );
}
