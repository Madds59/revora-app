import { getLocale, getTranslations } from "next-intl/server";

import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { formatDate, type AppLocale } from "@/lib/formatters";
import { createClient } from "@/lib/supabase/server";

import { SecurityClient, type MfaFactorView } from "./security-client";

export default async function SecuritySettingsPage() {
  const t = await getTranslations("settings.security");
  const locale = (await getLocale()) as AppLocale;
  await requireUser();
  const supabase = await createClient();

  // `listFactors().data.totp` is typed by the SDK as VERIFIED-only
  // (`Factor<'totp', 'verified'>[]`) — an abandoned unverified factor never
  // appears here. It only shows up in `.data.all`, which
  // `startEnrollment` (actions.ts -> lib/validation/mfa.js) reads to recover
  // from it; this page has no reason to surface that internal detail.
  const { data, error } = await supabase.auth.mfa.listFactors();

  // A transient failure here must NOT silently render as "no authenticator
  // app" (factors = []) — that would tell a user who genuinely has MFA
  // enabled that they don't, which could prompt them to needlessly re-enroll.
  // Matches the existing convention (e.g. (dashboard)/vehicles/page.tsx):
  // check the query error explicitly and show ErrorState instead of
  // swallowing it into an empty-looking success state.
  if (error) {
    console.error("mfa_list_factors_error", error.code ?? "unknown");
    return (
      <>
        <PageHeader title={t("title")} description={t("description")} />
        <div className="p-6">
          <ErrorState
            title={t("error.title")}
            description={t("error.description")}
            backHref="/"
            backLabel={t("error.backLabel")}
          />
        </div>
      </>
    );
  }

  const factors: MfaFactorView[] = (data?.totp ?? []).map((factor) => ({
    id: factor.id,
    createdAtLabel: formatDate(factor.created_at, undefined, locale),
  }));

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex flex-col gap-6 p-6">
        <SecurityClient factors={factors} />
      </div>
    </>
  );
}
