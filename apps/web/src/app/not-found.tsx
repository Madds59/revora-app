import Link from "next/link";

import { BrandState } from "@/components/brand-state";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <BrandState
      code="404"
      title="We couldn't find that page"
      description="The page may have moved, or the link is no longer valid. Let's get you back on track."
    >
      <Link href="/" className={buttonVariants()}>
        Back to dashboard
      </Link>
      <Link
        href="/portal"
        className={buttonVariants({ variant: "outline" })}
      >
        Go to portal
      </Link>
    </BrandState>
  );
}
