import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PortalQuoteDetailLoading() {
  return (
    <>
      <PageHeader title="Quote" description="Loading quote details." />
      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Loading quote</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-40 animate-pulse rounded-lg border bg-muted/40" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
