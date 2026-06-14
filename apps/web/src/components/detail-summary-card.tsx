"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type DetailSummaryRow = {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
};

export function DetailSummaryCard({
  title,
  description,
  rows,
  status,
  action,
  className,
}: {
  action?: React.ReactNode;
  className?: string;
  description?: string;
  rows: DetailSummaryRow[];
  status?: { label: string; variant?: "default" | "secondary" | "outline" | "destructive" };
  title: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {status && <Badge variant={status.variant ?? "outline"}>{status.label}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-4 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="space-y-1">
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                {row.label}
              </dt>
              <dd className="text-sm">{row.value}</dd>
              {row.note && <div className="text-muted-foreground text-xs">{row.note}</div>}
            </div>
          ))}
        </dl>
        {action && <div>{action}</div>}
      </CardContent>
    </Card>
  );
}
