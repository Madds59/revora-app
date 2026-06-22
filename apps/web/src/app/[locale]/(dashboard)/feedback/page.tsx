import { getLocale, getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { FeedbackInboxActions } from "@/components/feedback-inbox-actions";
import { FeedbackSubmissionForm } from "@/components/feedback-submission-form";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/formatters";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_SEVERITIES,
  FEEDBACK_STATUSES,
  getFeedbackCategoryLabel,
  getFeedbackPriorityLabel,
  getFeedbackSeverityLabel,
  getFeedbackSourceLabel,
  getFeedbackStatusLabel,
} from "@/lib/launch-ops";
import { canManageSettings } from "@/lib/permissions";
import { submitFeedbackReport, updateFeedbackReport } from "@/lib/actions/launch-ops";

type SearchParams = Record<string, string | string[] | undefined>;

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

function asString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function isAllowed<T extends string>(values: readonly T[], value: string): value is T {
  return values.includes(value as T);
}

function filteredValue<T extends string>(
  values: readonly T[],
  value: string,
): T | "all" {
  if (value === "" || value === "all") return "all";
  return isAllowed(values, value) ? value : "all";
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const locale = (await getLocale()) === "ar" ? "ar" : "en";
  const t = await getTranslations("feedback");
  const { member, business } = await requireMembership();
  const canEdit = canManageSettings(member.role);
  const params = await searchParams;

  const category = filteredValue(FEEDBACK_CATEGORIES, asString(params.category));
  const severity = filteredValue(FEEDBACK_SEVERITIES, asString(params.severity));
  const status = filteredValue(FEEDBACK_STATUSES, asString(params.status));
  const priority = filteredValue(FEEDBACK_PRIORITIES, asString(params.priority));
  const query = asString(params.q).trim();

  const supabase = await createClient();
  let queryBuilder = supabase
    .from("feedback_reports")
    .select(
      "id, business_id, customer_id, submitted_by, submitted_by_email, submitted_by_name, submitted_role, source, locale, category, severity, title, description, page_url, status, priority, created_at, resolved_at",
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (category !== "all") queryBuilder = queryBuilder.eq("category", category);
  if (severity !== "all") queryBuilder = queryBuilder.eq("severity", severity);
  if (status !== "all") queryBuilder = queryBuilder.eq("status", status);
  if (priority !== "all") queryBuilder = queryBuilder.eq("priority", priority);
  if (query) {
    queryBuilder = queryBuilder.or(
      `title.ilike.%${query}%,description.ilike.%${query}%,submitted_by_name.ilike.%${query}%,submitted_by_email.ilike.%${query}%`,
    );
  }

  const { data, error } = await queryBuilder;
  const reports = (data ?? []) as unknown as FeedbackRow[];

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
              <Link
                href="/implementation/import-templates"
                className={buttonVariants({ variant: "secondary" })}
              >
                {t("actions.templates")}
          </Link>
        }
      />

      <div className="flex flex-col gap-6 p-6">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <Card>
            <CardHeader>
              <CardTitle>{t("form.title")}</CardTitle>
              <CardDescription>{t("form.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <FeedbackSubmissionForm
                action={submitFeedbackReport}
                businessId={business.id}
                source="dashboard"
                submitLabel={t("form.submit")}
                titlePlaceholder={t("form.titlePlaceholder")}
              />
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2 rounded-lg border p-4">
              <form className="grid w-full gap-3 md:grid-cols-5" method="get">
                <label className="grid gap-1 text-sm">
                  <span className="text-muted-foreground">{t("filters.search")}</span>
                  <input
                    name="q"
                    defaultValue={query}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none"
                    placeholder={t("filters.searchPlaceholder")}
                  />
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="text-muted-foreground">{t("filters.category")}</span>
                  <select
                    name="category"
                    defaultValue={category}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none"
                  >
                    <option value="all">{t("filters.all")}</option>
                    {FEEDBACK_CATEGORIES.map((value) => (
                      <option key={value} value={value}>
                        {getFeedbackCategoryLabel(value, locale)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="text-muted-foreground">{t("filters.status")}</span>
                  <select
                    name="status"
                    defaultValue={status}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none"
                  >
                    <option value="all">{t("filters.all")}</option>
                    {FEEDBACK_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {getFeedbackStatusLabel(value, locale)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="text-muted-foreground">{t("filters.severity")}</span>
                  <select
                    name="severity"
                    defaultValue={severity}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none"
                  >
                    <option value="all">{t("filters.all")}</option>
                    {FEEDBACK_SEVERITIES.map((value) => (
                      <option key={value} value={value}>
                        {getFeedbackSeverityLabel(value, locale)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="text-muted-foreground">{t("filters.priority")}</span>
                  <select
                    name="priority"
                    defaultValue={priority}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none"
                  >
                    <option value="all">{t("filters.all")}</option>
                    {FEEDBACK_PRIORITIES.map((value) => (
                      <option key={value} value={value}>
                        {getFeedbackPriorityLabel(value, locale)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-end gap-2 md:col-span-5">
                  <button
                    type="submit"
                    className={buttonVariants({ size: "sm" })}
                  >
                    {t("filters.apply")}
                  </button>
                  <Link
                    href="/feedback"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    {t("filters.reset")}
                  </Link>
                </div>
              </form>
            </div>

            {error ? (
              <p className="text-destructive text-sm">{t("inbox.error")}</p>
            ) : reports.length === 0 ? (
              <EmptyState
                title={t("inbox.empty.title")}
                description={t("inbox.empty.description")}
              />
            ) : (
              <div className="flex flex-col gap-4">
                {reports.map((report) => {
                  const submittedBy =
                    report.submitted_by_name ??
                    report.submitted_by_email ??
                    t("inbox.unknownSubmittedBy");

                  return (
                    <div key={report.id} className="rounded-lg border p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-3">
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
                          <div className="space-y-1">
                            <h3 className="text-base font-semibold">{report.title}</h3>
                            <p className="text-muted-foreground whitespace-pre-wrap text-sm leading-6">
                              {report.description}
                            </p>
                          </div>
                          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="space-y-1">
                              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                                {t("inbox.submittedBy")}
                              </dt>
                              <dd className="text-sm">{submittedBy}</dd>
                            </div>
                            <div className="space-y-1">
                              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                                {t("inbox.createdAt")}
                              </dt>
                              <dd className="text-sm">
                                {formatDateTime(report.created_at, undefined, locale)}
                              </dd>
                            </div>
                            <div className="space-y-1">
                              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                                {t("inbox.sourcePage")}
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
                                {t("inbox.resolvedAt")}
                              </dt>
                              <dd className="text-sm">
                                {report.resolved_at
                                  ? formatDateTime(report.resolved_at, undefined, locale)
                                  : t("inbox.notResolved")}
                              </dd>
                            </div>
                          </dl>
                        </div>

                        {canEdit ? (
                          <div className="w-full max-w-lg">
                            <FeedbackInboxActions
                              action={updateFeedbackReport}
                              feedbackReportId={report.id}
                              currentStatus={report.status}
                              currentPriority={report.priority}
                            />
                          </div>
                        ) : (
                          <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                            {t("inbox.readOnly")}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
