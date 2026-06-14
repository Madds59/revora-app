"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ErrorState({
  title,
  description,
  errorDigest,
  onRetry,
  retryLabel,
  backHref,
  backLabel,
  className,
}: {
  backHref?: string;
  backLabel?: string;
  className?: string;
  description: string;
  errorDigest?: string;
  onRetry?: () => void;
  retryLabel?: string;
  title: string;
}) {
  const t = useTranslations("common.states");
  const resolvedRetryLabel = retryLabel ?? t("errorRetry");
  const resolvedBackLabel = backLabel ?? t("errorBack");
  return (
    <div
      className={cn(
        "mx-auto flex max-w-xl flex-col items-center gap-4 rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center",
        className,
      )}
    >
      <div className="space-y-1">
        <h3 className="font-medium leading-6">{title}</h3>
        <p className="text-muted-foreground text-sm leading-6">{description}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className={buttonVariants()}
          >
            <RotateCcw />
            {resolvedRetryLabel}
          </button>
        )}
        {backHref && (
          <Link href={backHref} className={buttonVariants({ variant: "outline" })}>
            {resolvedBackLabel}
          </Link>
        )}
      </div>

      {errorDigest && (
        <p className="text-muted-foreground text-xs">{t("errorReference", { digest: errorDigest })}</p>
      )}
    </div>
  );
}
