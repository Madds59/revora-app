import { PageHeader } from "@/components/page-header";

export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="p-6">
        <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
          This module is part of a later release.
        </div>
      </div>
    </>
  );
}
