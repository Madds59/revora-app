import { getLocale, getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { FeedbackSubmissionForm } from "@/components/feedback-submission-form";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getUser, requireCustomerPortal } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/formatters";
import {
  getFeedbackCategoryLabel,
  getFeedbackPriorityLabel,
  getFeedbackSeverityLabel,
  getFeedbackSourceLabel,
  getFeedbackStatusLabel,
} from "@/lib/launch-ops";
import { submitFeedbackReport } from "@/lib/actions/launch-ops";

type FeedbackRow = {
  id: string;
  business_id: string;
  customer_id: string | null;
  submitted_by: string | null;
  submitted_by_email: string | null;
  submitted_by_name: string | null;
  submitted_role: string;
  source: string;
  locale: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  page_url: string | null;
  status: string;
  priority: string;
  created_at: string;
  resolved_at: string | null;
};

export default async function PortalFeedbackPage() {
  const locale = (await getLocale()) === "ar" ? "ar" : "en";
  const t = await getTranslations("feedback");
  const user = await getUser();
  const { accounts } = await requireCustomerPortal();
  const supabase = await createClient();
  const businessIds = accounts.map((account) => account.business_id);
  const customerIds = accounts.map((account) => account.id);

  const { data, error } = businessIds.length
    ? await supabase
        .from("feedback_reports")
        .select(
          "id, business_id, customer_id, submitted_by, submitted_by_email, submitted_by_name, submitted_role, source, locale, category, severity, title, description, page_url, status, priority, created_at, resolved_at",
        )
        .in("business_id", businessIds)
        .or(`submitted_by.eq.${user?.id ?? ""},customer_id.in.(${customerIds.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [], error: null };

  const reports = (data ?? []) as unknown as FeedbackRow[];
  const accountOptions = accounts.map((account) => ({
    businessId: account.business_id,
    customerId: account.id,
    label: `${account.full_name} · ${account.business?.name ?? t("fallback.workshop")}`,
  }));
  const businessNames = new Map(
    accounts.map((account) => [account.business_id, account.business?.name ?? null]),
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("form.title")}</CardTitle>
            <CardDescription>{t("form.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {accountOptions.length === 0 ? (
              <EmptyState
                title={t("form.noAccountTitle")}
                description={t("form.noAccountDescription")}
              />
            ) : (
              <FeedbackSubmissionForm
                action={submitFeedbackReport}
                accounts={accountOptions}
                source="portal"
                submitLabel={t("form.submit")}
                accountLabel={t("form.account")}
                titlePlaceholder={t("form.titlePlaceholder")}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("submissions.title")}</CardTitle>
            <CardDescription>{t("submissions.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error ? (
              <p className="text-destructive text-sm">{t("submissions.error")}</p>
            ) : reports.length === 0 ? (
              <EmptyState
                title={t("submissions.empty.title")}
                description={t("submissions.empty.description")}
              />
            ) : (
              <div className="flex flex-col gap-4">
                {reports.map((report) => {
                  const workshopName =
                    businessNames.get(report.business_id) ?? t("fallback.workshop");
                  return (
                    <div key={report.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">
                          {getFeedbackCategoryLabel(report.category, locale)}
                        </Badge>
                        <Badge variant="outline">
                          {getFeedbackSeverityLabel(report.severity, locale)}
                        </Badge>
                        <Badge variant="secondary">
                          {getFeedbackStatusLabel(report.status, locale)}
                        </Badge>
                        <Badge variant="outline">
                          {getFeedbackPriorityLabel(report.priority, locale)}
                        </Badge>
                        <Badge variant="outline">
                          {getFeedbackSourceLabel(report.source, locale)}
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-1">
                        <h3 className="text-base font-semibold">{report.title}</h3>
                        <p className="text-muted-foreground whitespace-pre-wrap text-sm leading-6">
                          {report.description}
                        </p>
                      </div>
                      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="space-y-1">
                          <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                            {t("submissions.workshop")}
                          </dt>
                          <dd className="text-sm">{workshopName}</dd>
                        </div>
                        <div className="space-y-1">
                          <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                            {t("submissions.createdAt")}
                          </dt>
                          <dd className="text-sm">
                            {formatDateTime(report.created_at, undefined, locale)}
                          </dd>
                        </div>
                        <div className="space-y-1">
                          <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                            {t("submissions.sourcePage")}
                          </dt>
                          <dd className="text-sm">
                            {report.page_url ? (
                              <a
                                href={report.page_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline"
                              >
                                {report.page_url}
                              </a>
                            ) : (
                              "—"
                            )}
                          </dd>
                        </div>
                        <div className="space-y-1">
                          <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                            {t("submissions.resolvedAt")}
                          </dt>
                          <dd className="text-sm">
                            {report.resolved_at
                              ? formatDateTime(report.resolved_at, undefined, locale)
                              : t("submissions.notResolved")}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
