import { getTranslations } from "next-intl/server";

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
import { formatDate } from "@/lib/formatters";
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
  const t = await getTranslations("dashboardDocuments");
  const tError = await getTranslations("error");
  const { business } = await requireMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, title, document_type, created_at, customer:customers(full_name), quotation:quotations(quote_number), complaint:complaints(subject), job:jobs(title), media:media_assets(bucket, object_path, file_name, mime_type, size_bytes, visibility)",
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });
  if (error) console.error("DocumentsPage failed to load", error);

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
        title={t("title")}
        description={t("description")}
        action={
          <FileUpload
            bucket={PRIVATE_BUCKET}
            businessId={business.id}
            entity="documents"
            accept="*/*"
            label={t("actions.uploadDocument")}
            onUpload={uploadDocument.bind(null, { documentType: "file" })}
          />
        }
      />
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("library.title")}</CardTitle>
            <CardDescription>{t("library.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-sm text-destructive">{tError("description")}</p>
            ) : rows.length === 0 ? (
              <EmptyState
                title={t("empty.title")}
                description={t("empty.description")}
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
                      t("fallback.none");
                    return (
                      <MobileDataCard
                        title={row.title}
                        subtitle={related}
                        meta={
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">{row.document_type}</Badge>
                            <span>{formatDate(row.created_at)}</span>
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
                              {t("actions.download")}
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              {t("actions.unavailable")}
                            </span>
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
                        <TableHead>{t("table.document")}</TableHead>
                        <TableHead>{t("table.type")}</TableHead>
                        <TableHead>{t("table.relatedTo")}</TableHead>
                        <TableHead>{t("table.file")}</TableHead>
                        <TableHead>{t("table.created")}</TableHead>
                        <TableHead>{t("table.action")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => {
                        const related =
                          row.quotation?.quote_number ??
                          row.complaint?.subject ??
                          row.job?.title ??
                          row.customer?.full_name ??
                          t("fallback.none");
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">{row.title}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{row.document_type}</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{related}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {row.media?.file_name ?? t("fallback.none")}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(row.created_at)}
                            </TableCell>
                            <TableCell>
                              {row.url ? (
                                <a
                                  href={row.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sm font-medium underline"
                                >
                                  {t("actions.download")}
                                </a>
                              ) : (
                                <span className="text-muted-foreground text-sm">
                                  {t("actions.unavailable")}
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
