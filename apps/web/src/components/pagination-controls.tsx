import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export async function PaginationControls({
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
  const t = await getTranslations("common.pagination");
  return (
    <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">{t("total", { count: formatNumber(totalCount) })}</Badge>
        <span>
          {t("pageOf", { page: formatNumber(page), pageCount: formatNumber(pageCount) })}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {previousHref ? (
          <Link href={previousHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            {t("previous")}
          </Link>
        ) : (
          <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
            {t("previous")}
          </span>
        )}
        {nextHref ? (
          <Link href={nextHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            {t("next")}
          </Link>
        ) : (
          <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
            {t("next")}
          </span>
        )}
      </div>
    </div>
  );
}
