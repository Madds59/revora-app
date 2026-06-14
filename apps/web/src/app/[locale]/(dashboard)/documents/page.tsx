import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PRIVATE_BUCKET } from "@/lib/storage";
import { uploadDocument } from "@/lib/document-actions";
import { FileUpload } from "@/components/file-upload";

type DocumentRow = {
  id: string;
  title: string;
  document_type: string;
  created_at: string;
  customer: { full_name: string } | null;
  quotation: { quote_number: string } | null;
  complaint: { subject: string } | null;
  job: { title: string } | null;
  media: {
    bucket: string;
    object_path: string;
    file_name: string;
    mime_type: string;
    size_bytes: number;
    visibility: string;
  } | null;
};

type DocumentView = DocumentRow & { url: string | null };

export default async function DocumentsPage() {
  const { business } = await requireMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, title, document_type, created_at, customer:customers(full_name), quotation:quotations(quote_number), complaint:complaints(subject), job:jobs(title), media:media_assets(bucket, object_path, file_name, mime_type, size_bytes, visibility)",
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  const rawRows = (data ?? []) as unknown as DocumentRow[];
  const rows: DocumentView[] = await Promise.all(
    rawRows.map(async (row) => {
      if (!row.media || row.media.visibility !== "private") {
        return { ...row, url: null };
      }
      const { data: signed, error: signError } = await supabase.storage
        .from(row.media.bucket)
        .createSignedUrl(row.media.object_path, 60 * 10);
      return {
        ...row,
        url: signError ? null : signed?.signedUrl ?? null,
      };
    }),
  );

  return (
    <>
      <PageHeader
        title="Documents"
        description="Contracts, PDFs, and audit reports."
        action={
          <FileUpload
            bucket={PRIVATE_BUCKET}
            businessId={business.id}
            entity="documents"
            accept="*/*"
            label="Upload document"
            onUpload={uploadDocument.bind(null, { documentType: "file" })}
          />
        }
      />
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Document library</CardTitle>
            <CardDescription>
              Stored files linked to quotes, complaints, jobs, and customers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-sm text-destructive">{error.message}</p>
            ) : rows.length === 0 ? (
              <EmptyState
                title="No documents yet"
                description="Upload contracts, PDFs, and service records to keep them linked to quotes, jobs, and complaints."
              />
            ) : (
              <>
                <MobileDataList
                  items={rows}
                  empty={null}
                  getKey={(row) => row.id}
                  renderItem={(row) => {
                    const related =
                      row.quotation?.quote_number ??
                      row.complaint?.subject ??
                      row.job?.title ??
                      row.customer?.full_name ??
                      "—";
                    const downloadLabel = row.url ? "Download" : "Unavailable";
                    return (
                      <MobileDataCard
                        title={row.title}
                        subtitle={related}
                        meta={
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">{row.document_type}</Badge>
                            <span>{new Date(row.created_at).toLocaleDateString()}</span>
                          </div>
                        }
                        action={
                          row.url ? (
                            <a
                              href={row.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-medium underline"
                            >
                              {downloadLabel}
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-sm">{downloadLabel}</span>
                          )
                        }
                      />
                    );
                  }}
                />

                <div className="hidden rounded-lg border md:block">
                  <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Related to</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const related =
                        row.quotation?.quote_number ??
                        row.complaint?.subject ??
                        row.job?.title ??
                        row.customer?.full_name ??
                        "—";
                      const downloadLabel = row.url ? "Download" : "Unavailable";
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.title}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{row.document_type}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{related}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {row.media?.file_name ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(row.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {row.url ? (
                              <a
                                href={row.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm font-medium underline"
                              >
                                {downloadLabel}
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-sm">
                                {downloadLabel}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
