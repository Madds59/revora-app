import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export default function Loading() {
  return (
    <>
      <PageHeader title="Complaints" description="Customer complaints, internal follow-up, and resolution tracking." />
      <div className="flex flex-col gap-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-9 w-16" />
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="h-9 w-16" />
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <SkeletonBlock className="h-5 w-32" />
            <SkeletonBlock className="h-4 w-72" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
