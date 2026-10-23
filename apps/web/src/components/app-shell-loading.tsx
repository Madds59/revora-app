import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type LoadingVariant = "stats" | "list" | "detail" | "form";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/** One card of placeholder rows — used as a Suspense fallback for streamed sections. */
export function SectionSkeleton({
  rows = 3,
  title = true,
  className,
}: {
  rows?: number;
  title?: boolean;
  className?: string;
}) {
  return (
    <Card className={className} aria-busy="true">
      {title && (
        <CardHeader>
          <SkeletonBlock className="h-5 w-40" />
          <SkeletonBlock className="h-4 w-72 max-w-full" />
        </CardHeader>
      )}
      <CardContent className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <SkeletonBlock key={index} className="h-12 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

function StatsBody() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="gap-2">
              <SkeletonBlock className="h-4 w-20" />
              <SkeletonBlock className="h-8 w-16" />
            </CardHeader>
          </Card>
        ))}
      </div>
      <SectionSkeleton rows={3} />
    </>
  );
}

function ListBody() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SkeletonBlock className="h-9 w-full sm:w-64" />
        <SkeletonBlock className="h-9 w-28" />
        <SkeletonBlock className="h-9 w-28" />
      </div>
      <SectionSkeleton rows={6} title={false} />
    </>
  );
}

function DetailBody() {
  return (
    <>
      <Card>
        <CardHeader className="gap-2">
          <SkeletonBlock className="h-5 w-56 max-w-full" />
          <SkeletonBlock className="h-4 w-80 max-w-full" />
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-full" />
        </CardContent>
      </Card>
      <SectionSkeleton rows={3} />
      <SectionSkeleton rows={2} />
    </>
  );
}

function FormBody() {
  return (
    <Card className="max-w-2xl">
      <CardContent className="flex flex-col gap-5 pt-6">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        ))}
        <SkeletonBlock className="h-10 w-32" />
      </CardContent>
    </Card>
  );
}

const BODY: Record<LoadingVariant, () => React.JSX.Element> = {
  stats: StatsBody,
  list: ListBody,
  detail: DetailBody,
  form: FormBody,
};

export function AppShellLoading({
  title,
  description,
  variant = "stats",
}: {
  description: string;
  title: string;
  variant?: LoadingVariant;
}) {
  const Body = BODY[variant];
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="flex flex-col gap-6 p-6" role="status" aria-live="polite" aria-label={description}>
        <Body />
      </div>
    </>
  );
}
