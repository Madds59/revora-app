import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export default function Loading() {
  return (
    <>
      <PageHeader title="Complaint" description="Loading complaint details..." />
      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="h-4 w-64" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <SkeletonBlock className="h-6 w-20" />
              <SkeletonBlock className="h-6 w-24" />
            </div>
            <SkeletonBlock className="h-20 w-full" />
            <SkeletonBlock className="h-16 w-full" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SkeletonBlock className="h-5 w-36" />
            <SkeletonBlock className="h-4 w-72" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <SkeletonBlock className="h-16 w-full" />
            <SkeletonBlock className="h-16 w-full" />
            <SkeletonBlock className="h-28 w-full" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
