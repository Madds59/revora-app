import { redirect } from "next/navigation";

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
          title="Join your business"
          description="An owner or manager must invite your email before you can access the dashboard."
        />
        <div className="flex flex-col gap-6 p-6">
          <EmptyState
            title="Invitation required"
            description="We couldn&apos;t find a pending business invitation for this account yet. Ask the business owner or manager to invite the same email address you used to sign up."
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
            Set up your business workspace.
          </span>
        </div>
        <OnboardingForm defaultName={defaultName} email={user.email ?? ""} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Choose your account type"
        description="Tell us how you plan to use Revora so we can send you to the right place."
      />
      <div className="flex flex-col gap-6 p-6">
        <OnboardingIntentForm />
      </div>
    </>
  );
}
