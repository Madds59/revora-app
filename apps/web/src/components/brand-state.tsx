import { Logo, FlagStripe } from "@/components/brand";

/**
 * Centered, brand-consistent layout for full-page edge states (404, errors).
 * No client hooks, so it renders fine inside both server (`not-found`) and
 * client (`error`) boundaries.
 */
export function BrandState({
  code,
  title,
  description,
  children,
}: {
  code?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="bg-muted/30 relative flex min-h-dvh flex-col items-center justify-center gap-7 p-6 text-center">
      <Logo />

      <div className="flex flex-col items-center gap-2">
        {code && (
          <span className="text-primary text-xs font-semibold uppercase tracking-[0.2em]">
            {code}
          </span>
        )}
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground max-w-md text-sm">
            {description}
          </p>
        )}
      </div>

      {children && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {children}
        </div>
      )}

      <FlagStripe className="max-w-32 rounded-full" />
    </main>
  );
}
