import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PaginationControls({
  previousHref,
  nextHref,
  page,
  pageCount,
  totalCount,
}: {
  nextHref?: string | null;
  page: number;
  pageCount: number;
  previousHref?: string | null;
  totalCount: number;
}) {
  return (
    <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">{totalCount} total</Badge>
        <span>
          Page {page} of {pageCount}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {previousHref ? (
          <Link href={previousHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Previous
          </Link>
        ) : (
          <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
            Previous
          </span>
        )}
        {nextHref ? (
          <Link href={nextHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Next
          </Link>
        ) : (
          <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
            Next
          </span>
        )}
      </div>
    </div>
  );
}
