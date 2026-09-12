import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { DetailSummaryCard } from "@/components/detail-summary-card";
import { Link } from "@/i18n/navigation";
import {
  PortalNotificationPreferencesForm,
  type PortalPreferenceAccount,
} from "@/components/portal-notification-preferences-form";
import { requireCustomerPortal, getUser } from "@/lib/auth";
import { formatDate } from "@/lib/formatters";
import { createClient } from "@/lib/supabase/server";

/**
 * Current template-wide email/SMS preference per linked account. A missing row
 * means "enabled" — that is also how the dispatcher reads it.
 */
async function loadPreferenceAccounts(
  accounts: Awaited<ReturnType<typeof requireCustomerPortal>>["accounts"],
  workshopFallback: string,
): Promise<PortalPreferenceAccount[]> {
  if (accounts.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification_preferences")
    .select("business_id, customer_id, channel, enabled")
    .in(
      "customer_id",
      accounts.map((account) => account.id),
    )
    .is("template_key", null);
  const rows = data ?? [];
  const lookup = (businessId: string, customerId: string, channel: "email" | "sms") =>
    rows.find(
      (row) =>
        row.business_id === businessId &&
        row.customer_id === customerId &&
        row.channel === channel,
    )?.enabled ?? true;

  return accounts.map((account) => ({
    customerId: account.id,
    businessId: account.business_id,
    businessName: account.business?.name ?? workshopFallback,
    emailEnabled: lookup(account.business_id, account.id, "email"),
    smsEnabled: lookup(account.business_id, account.id, "sms"),
  }));
}

export default async function PortalSettingsPage() {
  const t = await getTranslations("portalSettings");
  const tLegal = await getTranslations("legal");
  const { accounts } = await requireCustomerPortal();
  const user = await getUser();
  const primary = accounts[0]?.business ?? null;
  const preferenceAccounts = await loadPreferenceAccounts(accounts, t("fallback.workshop"));

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
                <CardTitle>{t("preferences.title")}</CardTitle>
                <CardDescription>{t("preferences.description")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {preferenceAccounts.map((account) => (
                  <PortalNotificationPreferencesForm
                    key={`${account.businessId}:${account.customerId}`}
                    account={account}
                  />
                ))}
                <p className="text-muted-foreground text-xs">{t("preferences.note")}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("security.title")}</CardTitle>
                <CardDescription>{t("security.description")}</CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground flex flex-col gap-2 text-sm">
                <p>{t("security.body")}</p>
                <Link href="/legal/privacy" className="text-foreground w-fit underline underline-offset-4">
                  {tLegal("nav.privacy")}
                </Link>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
