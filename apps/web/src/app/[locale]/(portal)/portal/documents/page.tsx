import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { requireCustomerPortal } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage";
import { formatDate } from "@/lib/formatters";
import type { Document } from "@/lib/database.types";

type DocumentRow = Pick<Document, "id" | "title" | "document_type" | "created_at"> & {
  complaint: { subject: string } | null;
  customer: { full_name: string } | null;
  job: { title: string } | null;
  media: { bucket: string; object_path: string; file_name: string; mime_type: string; visibility: string } | null;
  quotation: { quote_number: string } | null;
  url: string | null;
};

export default async function PortalDocumentsPage() {
  const t = await getTranslations("portalDocuments");
  const { accounts } = await requireCustomerPortal();
  if (accounts.length === 0) {
    return (
      <>
        <PageHeader title={t("title")} description={t("description")} />
        <div className="p-6">
          <EmptyState
            title={t("empty.noLinkedTitle")}
            description={t("empty.noLinkedDescription")}
            action={
              <Link href="/portal" className={buttonVariants({ variant: "outline" })}>
                {t("actions.backToPortal")}
              </Link>
            }
          />
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const customerIds = accounts.map((account) => account.id);

  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, title, document_type, created_at, customer:customers(full_name), quotation:quotations(quote_number), complaint:complaints(subject), job:jobs(title), media:media_assets(bucket, object_path, file_name, mime_type, visibility)",
    )
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });

  const rows = await Promise.all(
    ((data ?? []) as unknown as Omit<DocumentRow, "url">[]).map(async (row) => {
      const url = row.media?.visibility === "private" && row.media?.object_path
        ? await signedUrl(row.media.object_path)
        : null;
      return { ...row, url } satisfies DocumentRow;
    }),
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("library.title")}</CardTitle>
            <CardDescription>{t("library.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error ? (
              <p className="text-destructive text-sm">{error.message}</p>
            ) : rows.length === 0 ? (
              <EmptyState
                title={t("empty.noDocumentsTitle")}
                description={t("empty.noDocumentsDescription")}
                action={
                  <Link href="/portal" className={buttonVariants({ variant: "outline" })}>
                    {t("actions.backToPortal")}
                  </Link>
                }
              />
            ) : (
              <>
                <MobileDataList
                  items={rows}
                  empty={
                    <EmptyState
                      title={t("empty.noDocumentsTitle")}
                      description={t("empty.noDocumentsDescription")}
                    />
                  }
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
                            <Link
                              href={row.url}
                              target="_blank"
                              rel="noreferrer"
                              className={buttonVariants({ variant: "outline", size: "sm" })}
                            >
                              {t("actions.open")}
                            </Link>
                          ) : null
                        }
                      >
                        <div className="text-muted-foreground text-xs">
                          {row.media?.file_name ?? t("fallback.none")}
                        </div>
                      </MobileDataCard>
                    );
                  }}
                />

                <div className="hidden rounded-lg border md:block">
                  <table className="w-full caption-bottom text-sm">
                    <thead>
                      <tr className="[&>th]:h-10 [&>th]:px-2 [&>th]:text-start [&>th]:align-middle [&>th]:font-medium [&>th]:whitespace-nowrap">
                        <th>{t("table.document")}</th>
                        <th>{t("table.type")}</th>
                        <th>{t("table.relatedTo")}</th>
                        <th>{t("table.file")}</th>
                        <th>{t("table.created")}</th>
                        <th>{t("table.action")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const related =
                          row.quotation?.quote_number ??
                          row.complaint?.subject ??
                          row.job?.title ??
                          row.customer?.full_name ??
                          t("fallback.none");
                        return (
                          <tr key={row.id} className="border-b last:border-0">
                            <td className="p-2 align-middle whitespace-nowrap font-medium">{row.title}</td>
                            <td className="p-2 align-middle whitespace-nowrap">
                              <Badge variant="outline">{row.document_type}</Badge>
                            </td>
                            <td className="p-2 align-middle whitespace-nowrap text-muted-foreground">
                              {related}
                            </td>
                            <td className="p-2 align-middle whitespace-nowrap text-muted-foreground">
                              {row.media?.file_name ?? t("fallback.none")}
                            </td>
                            <td className="p-2 align-middle whitespace-nowrap text-muted-foreground">
                              {formatDate(row.created_at)}
                            </td>
                            <td className="p-2 align-middle whitespace-nowrap">
                              {row.url ? (
                                <Link
                                  href={row.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sm font-medium underline"
                                >
                                  {t("actions.open")}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground text-sm">{t("actions.unavailable")}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
