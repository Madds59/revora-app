import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  CalendarClock,
  CarFront,
  FileText,
  Search,
  ShieldAlert,
  Sparkles,
  Wrench,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/formatters";
import {
  searchVehicleIntelligence,
  type VehicleSearchResult,
  type VehicleSearchResultType,
} from "@/lib/vehicle-intelligence/search-service";

type SearchParams = {
  date?: string;
  q?: string;
  safety?: string;
  type?: string;
};

const TYPE_OPTIONS = [
  "all",
  "vehicles",
  "symptoms",
  "dtc",
  "diagnostics",
  "maintenance",
  "quotes",
] as const;

const DATE_OPTIONS = ["all", "7d", "30d", "this_month", "next_30d"] as const;
const SAFETY_OPTIONS = ["all", "low", "medium", "high", "critical", "stop_driving"] as const;

const TYPE_ICONS: Record<VehicleSearchResultType, typeof CarFront> = {
  diagnostics: Sparkles,
  dtc: Wrench,
  maintenance: CalendarClock,
  quotes: FileText,
  symptoms: ShieldAlert,
  vehicles: CarFront,
};

function optionLabel(
  t: Awaited<ReturnType<typeof getTranslations>>,
  namespace: "types" | "dateRanges" | "safety",
  value: string,
) {
  return t(`search.filters.${namespace}.${value}`);
}

function safetyVariant(result: VehicleSearchResult) {
  if (result.stopDrivingWarning || result.safetyLevel === "critical") return "destructive" as const;
  if (result.safetyLevel === "high") return "secondary" as const;
  return "outline" as const;
}

function ResultCard({
  locale,
  result,
  t,
}: {
  locale: "en" | "ar";
  result: VehicleSearchResult;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">{result.title}</CardTitle>
            <CardDescription>{result.subtitle}</CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {result.safetyLevel && (
              <Badge variant={safetyVariant(result)}>
                {optionLabel(t, "safety", result.safetyLevel)}
              </Badge>
            )}
            {result.stopDrivingWarning && (
              <Badge variant="destructive">{t("search.stopDriving")}</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {result.summary && (
          <p className="text-sm leading-6 text-muted-foreground">{result.summary}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{result.sourceNote}</Badge>
          {result.vehicleLabel && <span>{result.vehicleLabel}</span>}
          {result.customerLabel && <span>{result.customerLabel}</span>}
          {result.createdAt && <span>{formatDate(result.createdAt, undefined, locale)}</span>}
        </div>
        <Link href={result.sourceHref} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          {result.sourceLabel}
        </Link>
      </CardContent>
    </Card>
  );
}

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return {
    title: t("vehicleIntelligenceSearchTitle"),
    description: t("vehicleIntelligenceSearchDescription"),
  };
}

export default async function VehicleIntelligenceSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "en" | "ar" }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, queryParams, t] = await Promise.all([
    params,
    searchParams,
    getTranslations("vehicleIntelligence"),
  ]);
  const query = queryParams.q ?? "";
  const response = await searchVehicleIntelligence({
    dateRange: queryParams.date,
    locale,
    query,
    safety: queryParams.safety,
    type: queryParams.type,
  });
  const hasQuery = response.filters.query.length > 0;

  return (
    <>
      <PageHeader title={t("search.title")} description={t("search.description")} />
      <div className="space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search className="size-5" />
              {t("search.formTitle")}
            </CardTitle>
            <CardDescription>{t("search.formDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px_180px_auto] lg:items-end">
              <div className="grid gap-2">
                <Label htmlFor="vehicle-intelligence-search">{t("search.queryLabel")}</Label>
                <Input
                  id="vehicle-intelligence-search"
                  name="q"
                  defaultValue={response.filters.query}
                  placeholder={t("search.placeholder")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="vehicle-intelligence-type">{t("search.filters.type")}</Label>
                <select
                  id="vehicle-intelligence-type"
                  name="type"
                  defaultValue={response.filters.type}
                  className="border-input bg-background h-8 rounded-lg border px-2 text-sm"
                >
                  {TYPE_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {optionLabel(t, "types", value)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="vehicle-intelligence-date">{t("search.filters.date")}</Label>
                <select
                  id="vehicle-intelligence-date"
                  name="date"
                  defaultValue={response.filters.dateRange}
                  className="border-input bg-background h-8 rounded-lg border px-2 text-sm"
                >
                  {DATE_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {optionLabel(t, "dateRanges", value)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="vehicle-intelligence-safety">{t("search.filters.safetyLabel")}</Label>
                <select
                  id="vehicle-intelligence-safety"
                  name="safety"
                  defaultValue={response.filters.safety}
                  className="border-input bg-background h-8 rounded-lg border px-2 text-sm"
                >
                  {SAFETY_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {optionLabel(t, "safety", value)}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className={buttonVariants()}>
                <Search />
                {t("search.submit")}
              </button>
            </form>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                t("search.suggestions.overheating"),
                t("search.suggestions.p0300"),
                t("search.suggestions.maintenance"),
                t("search.suggestions.safety"),
                t("search.suggestions.customer"),
              ].map((suggestion) => (
                <Link
                  key={suggestion}
                  href={`/${locale}/ai/search?q=${encodeURIComponent(suggestion)}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {suggestion}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {response.error === "no_access" ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              {t("search.noAccess")}
            </CardContent>
          </Card>
        ) : response.error ? (
          <Card className="border-destructive/30">
            <CardContent className="flex gap-3 p-6 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              {response.error}
            </CardContent>
          </Card>
        ) : (
          <>
            {hasQuery && response.summary && (
              <Card className={response.summary.safetyWarning ? "border-destructive/30" : undefined}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {response.summary.safetyWarning ? (
                      <ShieldAlert className="size-5 text-destructive" />
                    ) : (
                      <Sparkles className="size-5" />
                    )}
                    {t("search.summaryTitle")}
                  </CardTitle>
                  <CardDescription>{t("search.summaryDescription")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">{response.summary.text}</p>
                </CardContent>
              </Card>
            )}

            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>{t("search.resultsCount", { count: response.results.length })}</span>
              <span>{t("search.scopeNote")}</span>
            </div>

            {response.results.length === 0 ? (
              <Card>
                <CardContent className="grid gap-2 p-6">
                  <h2 className="text-base font-medium">
                    {hasQuery ? t("search.emptyTitle") : t("search.startTitle")}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {hasQuery ? t("search.emptyDescription") : t("search.startDescription")}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {response.resultGroups.map((group) => {
                  const Icon = TYPE_ICONS[group.type];
                  return (
                    <section key={group.type} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 text-muted-foreground" />
                        <h2 className="text-sm font-medium">
                          {optionLabel(t, "types", group.type)} ({group.count})
                        </h2>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-2">
                        {group.results.map((result) => (
                          <ResultCard key={result.id} locale={locale} result={result} t={t} />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
