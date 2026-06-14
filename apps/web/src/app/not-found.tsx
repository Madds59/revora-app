import Link from "next/link";

import { BrandState } from "@/components/brand-state";
import { buttonVariants } from "@/components/ui/button";

// Global fallback for paths outside any locale segment. The passthrough root
// layout renders no <html>, so this provides its own.
export default function GlobalNotFound() {
  return (
    <html lang="en" dir="ltr">
      <body className="antialiased">
        <BrandState
          code="404"
          title="We couldn't find that page"
          description="The page may have moved, or the link is no longer valid. Let's get you back on track."
        >
          <Link href="/en" className={buttonVariants()}>
            Back to Revora
          </Link>
        </BrandState>
      </body>
    </html>
  );
}
