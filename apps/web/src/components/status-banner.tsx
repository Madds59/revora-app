import { CheckCircle2, Clock, XCircle, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type Tone = "success" | "destructive" | "muted";

const TONE: Record<Tone, { wrap: string; title: string; icon: LucideIcon }> = {
  success: {
    wrap: "border-success/25 bg-success/8",
    title: "text-success",
    icon: CheckCircle2,
  },
  destructive: {
    wrap: "border-destructive/25 bg-destructive/8",
    title: "text-destructive",
    icon: XCircle,
  },
  muted: {
    wrap: "border-border bg-muted/40",
    title: "text-foreground",
    icon: Clock,
  },
};

/**
 * Branded status panel for approval / decline / awaiting states. Title takes the
 * tone color; supporting copy renders muted underneath.
 */
export function StatusBanner({
  tone,
  title,
  children,
  icon,
  className,
}: {
  tone: Tone;
  title: React.ReactNode;
  children?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const t = TONE[tone];
  const Icon = icon ?? t.icon;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4",
        t.wrap,
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", t.title)} />
      <div className="min-w-0 text-sm">
        <p className={cn("font-medium", t.title)}>{title}</p>
        {children && (
          <div className="text-muted-foreground mt-1 flex flex-col gap-1">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
