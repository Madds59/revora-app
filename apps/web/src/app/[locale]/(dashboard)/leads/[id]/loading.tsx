import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export default function Loading() {
  return (
    <>
      <PageHeader title="Leads" description="Loading the inquiry." />
      <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          {[0, 1].map((index) => (
            <Card key={index}>
              <CardHeader>
                <SkeletonBlock className="h-5 w-32" />
                <SkeletonBlock className="h-4 w-64" />
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <SkeletonBlock className="h-16 w-full" />
                <SkeletonBlock className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <SkeletonBlock className="h-5 w-28" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((index) => (
              <SkeletonBlock key={index} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
