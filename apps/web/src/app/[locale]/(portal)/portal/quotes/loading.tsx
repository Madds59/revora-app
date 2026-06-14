import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PortalQuotesLoading() {
  return (
    <>
      <PageHeader title="Quotes" description="Review and approve quotations from your workshop." />
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Loading quotes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-28 animate-pulse rounded-lg border bg-muted/40" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
