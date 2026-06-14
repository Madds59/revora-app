import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { DetailSummaryCard } from "@/components/detail-summary-card";
import { requireCustomerPortal, getUser } from "@/lib/auth";
import { formatDate } from "@/lib/formatters";

export default async function PortalSettingsPage() {
  const t = await getTranslations("portalSettings");
  const { accounts } = await requireCustomerPortal();
  const user = await getUser();
  const primary = accounts[0]?.business ?? null;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="flex flex-col gap-6 p-6">
        {accounts.length === 0 ? (
          <EmptyState
            title={t("empty.title")}
            description={t("empty.description")}
          />
        ) : (
          <>
            <DetailSummaryCard
              title={t("summary.title")}
              description={t("summary.description")}
              rows={[
                { label: t("summary.email"), value: user?.email ?? "—" },
                {
                  label: t("summary.linkedRecords"),
                  value: t("summary.recordsValue", { count: accounts.length }),
                },
                {
                  label: t("summary.primaryWorkshop"),
                  value: primary?.name ?? "—",
                  note: primary?.legal_name ?? undefined,
                },
              ]}
              status={{ label: t("summary.readOnly") }}
            />

            <Card>
              <CardHeader>
                <CardTitle>{t("accounts.title")}</CardTitle>
                <CardDescription>{t("accounts.description")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {accounts.map((account) => (
                  <div key={account.id} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-medium">{account.full_name}</div>
                        <div className="text-muted-foreground text-xs">
                          {account.email ?? t("fallback.noEmail")}
                        </div>
                      </div>
                      <Badge variant="outline">{account.business?.name ?? t("fallback.workshop")}</Badge>
                    </div>
                    <dl className="mt-3 grid gap-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">{t("account.phone")}</dt>
                        <dd>{account.phone ?? "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">{t("account.language")}</dt>
                        <dd>{account.preferred_language}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">{t("account.created")}</dt>
                        <dd>{formatDate(account.created_at)}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("security.title")}</CardTitle>
                <CardDescription>{t("security.description")}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {t("security.body")}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
