import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export function AppShellLoading({
  title,
  description,
}: {
  description: string;
  title: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="flex flex-col gap-6 p-6">
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

        <Card>
          <CardHeader>
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="h-4 w-72" />
          </CardHeader>
          <CardContent className="space-y-3">
            <SkeletonBlock className="h-12 w-full" />
            <SkeletonBlock className="h-12 w-full" />
            <SkeletonBlock className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
