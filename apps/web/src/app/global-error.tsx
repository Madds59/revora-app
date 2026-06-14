"use client";

import { useEffect } from "react";

import "./globals.css";
import { BrandState } from "@/components/brand-state";
import { buttonVariants } from "@/components/ui/button";

// global-error replaces the root layout, so it must render its own <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="antialiased">
        <BrandState
          code="Critical error"
          title="The app ran into a problem"
          description="Something went wrong while loading Revora. Reloading usually fixes it."
        >
          <button
            type="button"
            onClick={reset}
            className={buttonVariants()}
          >
            Reload Revora
          </button>
        </BrandState>
      </body>
    </html>
  );
}
