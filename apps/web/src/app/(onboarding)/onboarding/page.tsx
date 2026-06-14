import { redirect } from "next/navigation";

import { getCurrentMembership, requireUser } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const user = await requireUser();
  const membership = await getCurrentMembership();
  if (membership) redirect("/");

  const defaultName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : "";

  return (
    <div className="bg-muted/40 flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-2xl font-semibold tracking-tight">Revora</span>
        <span className="text-muted-foreground text-sm">
          Let&apos;s set up your workspace.
        </span>
      </div>
      <OnboardingForm defaultName={defaultName} email={user.email ?? ""} />
    </div>
  );
}
