import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  claimBusinessInvitations,
  claimCustomerRecords,
  getCurrentAccountIntent,
  getCurrentCustomerAccounts,
  getCurrentMembership,
  getUser,
  isSuperAdmin,
} from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";
import { OnboardingIntentForm } from "./onboarding-intent-form";

export default async function OnboardingPage() {
  const t = await getTranslations("onboarding");
  const user = await getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership();
  if (membership) redirect("/");

  const intent = await getCurrentAccountIntent();
  await claimCustomerRecords();
  const customerAccounts = await getCurrentCustomerAccounts();

  if (await isSuperAdmin()) redirect("/admin");

  if (intent === null && customerAccounts.length > 0) {
    redirect("/portal");
  }

  if (intent === "customer") redirect("/portal");

  if (intent === "staff_invited") {
    const accepted = await claimBusinessInvitations();
    if (accepted > 0) redirect("/");

    return (
      <>
        <PageHeader
          title={t("staff.title")}
          description={t("staff.description")}
        />
        <div className="flex flex-col gap-6 p-6">
          <EmptyState
            title={t("staff.emptyTitle")}
            description={t("staff.emptyDescription")}
          />
        </div>
      </>
    );
  }

  if (intent === "business_owner") {
    const defaultName =
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : "";

    return (
      <div className="bg-muted/40 flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-2xl font-semibold tracking-tight">Revora</span>
          <span className="text-muted-foreground text-sm">
            {t("owner.subtitle")}
          </span>
        </div>
        <OnboardingForm defaultName={defaultName} email={user.email ?? ""} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={t("intent.title")}
        description={t("intent.description")}
      />
      <div className="flex flex-col gap-6 p-6">
        <OnboardingIntentForm />
      </div>
    </>
  );
}
