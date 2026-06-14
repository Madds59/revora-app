import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export default function Loading() {
  return (
    <>
      <PageHeader title="Jobs" description="Loading work orders..." />
      <div className="p-6">
        <Card>
          <CardHeader>
            <SkeletonBlock className="h-5 w-32" />
            <SkeletonBlock className="h-4 w-64" />
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
