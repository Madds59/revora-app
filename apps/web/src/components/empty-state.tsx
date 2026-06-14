"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  action?: React.ReactNode;
  className?: string;
  description: string;
  icon?: React.ReactNode;
  title: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-lg border border-dashed p-10 text-center",
        className,
      )}
    >
      {icon && (
        <div className="text-muted-foreground flex size-10 items-center justify-center rounded-full bg-muted">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="font-medium">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {action && <div className="flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}

export function EmptyStateLink({
  href,
  label,
  variant = "secondary",
}: {
  href: string;
  label: string;
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
}) {
  return (
    <Link href={href} className={buttonVariants({ variant })}>
      {label}
    </Link>
  );
}
