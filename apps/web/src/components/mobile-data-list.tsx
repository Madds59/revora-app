import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MobileDataList<T>({
  items,
  renderItem,
  empty,
  className,
  getKey,
}: {
  className?: string;
  empty: React.ReactNode;
  getKey?: (item: T, index: number) => React.Key;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}) {
  if (items.length === 0) {
    return <>{empty}</>;
  }

  return (
    <div className={cn("flex flex-col gap-3 md:hidden", className)}>
      {items.map((item, index) => (
        <div key={getKey?.(item, index) ?? index}>{renderItem(item)}</div>
      ))}
    </div>
  );
}

export function MobileDataCard({
  title,
  subtitle,
  meta,
  action,
  children,
}: {
  action?: React.ReactNode;
  children?: React.ReactNode;
  meta?: React.ReactNode;
  subtitle?: React.ReactNode;
  title: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="font-medium">{title}</div>
            {subtitle && <div className="text-muted-foreground text-xs">{subtitle}</div>}
          </div>
          {action}
        </div>
        {meta && <div className="text-muted-foreground text-xs">{meta}</div>}
        {children}
      </CardContent>
    </Card>
  );
}
