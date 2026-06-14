import { cn } from "@/lib/utils";

/**
 * Revora brandmark. A graphite-friendly green tile carrying the UAE-flag red
 * "hoist" bar and a white trust-check — the check nods to the product's core
 * approvals/verification flow. Colors come from brand CSS vars so the mark sits
 * correctly on warm-white surfaces and the graphite sidebar alike.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Revora"
      className={cn("size-8 shrink-0", className)}
    >
      <defs>
        <clipPath id="revora-tile">
          <rect width="32" height="32" rx="9" />
        </clipPath>
      </defs>
      <g clipPath="url(#revora-tile)">
        <rect width="32" height="32" fill="var(--brand-green)" />
        <rect width="7.5" height="32" fill="var(--brand-red)" />
      </g>
      <path
        d="M12.5 16.6l3.4 3.5 7.2-8.2"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Full lockup: mark + wordmark (+ optional subtitle). `tone` controls the text
 * color so it reads on light content areas or the dark sidebar / auth panel.
 */
export function Logo({
  wordmark = "Revora",
  subtitle,
  tone = "default",
  className,
  markClassName,
}: {
  wordmark?: string;
  subtitle?: string;
  tone?: "default" | "inverted";
  className?: string;
  markClassName?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <div className="flex min-w-0 flex-col gap-0.5 leading-none">
        <span
          className={cn(
            "font-heading truncate text-lg font-semibold tracking-tight",
            tone === "inverted" ? "text-sidebar-foreground" : "text-foreground",
          )}
        >
          {wordmark}
        </span>
        {subtitle && (
          <span
            className={cn(
              "truncate text-xs",
              tone === "inverted"
                ? "text-sidebar-foreground/60"
                : "text-muted-foreground",
            )}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

/** Thin UAE-flag accent rule. Use under brand headers and panels. */
export function FlagStripe({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("uae-flag-stripe h-0.5 w-full", className)}
    />
  );
}
