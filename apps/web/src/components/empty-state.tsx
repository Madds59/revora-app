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
        "mx-auto flex max-w-xl flex-col items-center gap-4 rounded-xl border border-dashed bg-muted/20 p-8 text-center sm:p-10",
        className,
      )}
    >
      {icon && (
        <div className="text-primary flex size-11 items-center justify-center rounded-full bg-primary/10">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="font-medium leading-6">{title}</h3>
        <p className="text-muted-foreground text-sm leading-6">{description}</p>
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
