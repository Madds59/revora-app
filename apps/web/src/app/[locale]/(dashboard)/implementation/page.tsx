import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireMembership } from "@/lib/auth";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import {
  buildImplementationChecklist,
  buildImplementationReadinessCards,
} from "@/lib/implementation-readiness";
import { getImplementationStageLabel } from "@/lib/launch-ops";
import { canManageSettings } from "@/lib/permissions";
import { ImplementationNotesForm } from "@/components/implementation-notes-form";
import { saveImplementationProgress } from "@/lib/actions/launch-ops";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type QueryBuilder = ReturnType<SupabaseClient["from"]>;
type PublicTableName = keyof Database["public"]["Tables"];

async function countRows(
  supabase: SupabaseClient,
  table: PublicTableName,
  query?: (builder: QueryBuilder) => QueryBuilder,
) {
  const baseQuery = supabase.from(table).select("id", { count: "exact", head: true });
  const { count, error } = await (query ? query(baseQuery) : baseQuery);
  if (error) return null;
  return count ?? 0;
}

export default async function ImplementationPage() {
  const locale = (await getLocale()) === "ar" ? "ar" : "en";
  const t = await getTranslations("implementation");
  const { member, business } = await requireMembership();
  const canEdit = canManageSettings(member.role);
  const supabase = await createClient();

  const [
    branches,
    teamMembers,
    customers,
    vehicles,
    services,
    quotations,
    jobs,
    complaints,
    documents,
    progressResult,
  ] = await Promise.all([
    countRows(supabase, "branches", (builder) => builder.eq("business_id", business.id)),
    countRows(supabase, "business_members", (builder) =>
      builder.eq("business_id", business.id).eq("is_active", true),
    ),
    countRows(supabase, "customers", (builder) =>
      builder.eq("business_id", business.id).is("deleted_at", null),
    ),
    countRows(supabase, "vehicles", (builder) => builder.eq("business_id", business.id)),
    countRows(supabase, "services", (builder) => builder.eq("business_id", business.id)),
    countRows(supabase, "quotations", (builder) => builder.eq("business_id", business.id)),
    countRows(supabase, "jobs", (builder) => builder.eq("business_id", business.id)),
    countRows(supabase, "complaints", (builder) => builder.eq("business_id", business.id)),
    countRows(supabase, "documents", (builder) => builder.eq("business_id", business.id)),
    supabase
      .from("business_implementation_progress")
      .select("*")
      .eq("business_id", business.id)
      .maybeSingle(),
  ]);

  const progress = progressResult.data ?? null;
  const counts = {
    branches,
    teamMembers,
    customers,
    vehicles,
    services,
    quotations,
    jobs,
    complaints,
    documents,
  };
  const businessProfileComplete = Boolean(business.name?.trim() && business.country?.trim());
  const readinessCards = buildImplementationReadinessCards(counts, locale);
  const checklist = buildImplementationChecklist(counts, locale, {
    businessProfileComplete,
  });
  const completionCount = checklist.filter((item) => item.complete).length;

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
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <Card>
            <CardHeader>
              <CardTitle>{t("stage.title")}</CardTitle>
              <CardDescription>{t("stage.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {getImplementationStageLabel(progress?.stage ?? "not_started", locale)}
                </Badge>
                <Badge variant="outline">
                  {t("stage.completeCount", { count: completionCount })}
                </Badge>
              </div>

              {canEdit ? (
                <ImplementationNotesForm
                  action={saveImplementationProgress}
                  businessId={business.id}
                  currentStage={progress?.stage ?? "not_started"}
                  currentNotes={progress?.notes ?? null}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  {t("stage.readOnly")}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("checklist.title")}</CardTitle>
              <CardDescription>{t("checklist.description")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {checklist.map((item) => (
                <div key={item.key} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium">{item.label}</div>
                      <div className="text-muted-foreground text-sm">{item.detail}</div>
                    </div>
                    <Badge variant={item.complete ? "default" : "secondary"}>
                      {item.complete ? t("checklist.done") : t("checklist.next")}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link href={item.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      {t("checklist.open")}
                    </Link>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{t("readiness.title")}</h2>
            <p className="text-muted-foreground text-sm">{t("readiness.description")}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {readinessCards.map((card) => (
              <Card key={card.key}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3">
                    <span>{card.label}</span>
                    <Badge variant={card.complete ? "default" : "secondary"}>
                      {card.complete ? t("readiness.ready") : t("readiness.pending")}
                    </Badge>
                  </CardTitle>
                  <CardDescription>{card.detail}</CardDescription>
                </CardHeader>
                <CardContent className="text-2xl font-semibold tabular-nums">
                  {card.value}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>{t("notes.title")}</CardTitle>
            <CardDescription>{t("notes.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {progress?.notes?.trim()
                ? progress.notes
                : t("notes.empty")}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("futureImport.title")}</CardTitle>
            <CardDescription>{t("futureImport.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t("futureImport.body")}</p>
            <Link
              href="/implementation/import-templates"
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("futureImport.action")}
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
