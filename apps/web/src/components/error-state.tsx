"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ErrorState({
  title,
  description,
  errorDigest,
  onRetry,
  retryLabel = "Try again",
  backHref,
  backLabel = "Go back",
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
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center",
        className,
      )}
    >
      <div className="space-y-1">
        <h3 className="font-medium">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className={buttonVariants()}
          >
            <RotateCcw />
            {retryLabel}
          </button>
        )}
        {backHref && (
          <Link href={backHref} className={buttonVariants({ variant: "outline" })}>
            {backLabel}
          </Link>
        )}
      </div>

      {errorDigest && (
        <p className="text-muted-foreground text-xs">Reference: {errorDigest}</p>
      )}
    </div>
  );
}
