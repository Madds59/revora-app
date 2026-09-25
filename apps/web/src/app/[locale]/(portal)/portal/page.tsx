import Link from "next/link";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Building2 } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SectionSkeleton } from "@/components/app-shell-loading";
import { StatusBanner } from "@/components/status-banner";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireCustomerPortal } from "@/lib/auth";
import { disabledBannerKey } from "@/lib/features/flags";
import { PendingQuotesSection } from "./_sections/pending-quotes-section";
import { ActiveJobsSection } from "./_sections/active-jobs-section";
import { ComplaintsSection } from "./_sections/complaints-section";

export default async function PortalHomePage({
  searchParams,
}: {
  searchParams: Promise<{ disabled?: string | string[] }>;
}) {
  const t = await getTranslations("portalHome");
  const ai = await getTranslations("vehicleIntelligence");
  const tf = await getTranslations("features");
  const { disabled } = await searchParams;
  const disabledKey = disabledBannerKey(disabled);
  const banner = disabledKey && (
    <StatusBanner tone="muted" role="status" title={tf("disabled.title")}>
      <p>{tf("disabled.body")}</p>
    </StatusBanner>
  );
  const { accounts } = await requireCustomerPortal();
  if (accounts.length === 0) {
    return (
      <>
        <PageHeader
          title={t("title")}
          description={t("description")}
        />
        <div className="flex flex-col gap-6 p-6">
          {banner}
          <EmptyState
            title={t("noLinkedAccountTitle")}
            description={t("noLinkedAccountDescription")}
          />
        </div>
      </>
    );
  }

  const customerIds = accounts.map((account) => account.id);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
          <Link href="/portal/complaints/new" className={buttonVariants()}>
            {t("submitComplaint")}
          </Link>
        }
      />
      <div className="flex flex-col gap-6 p-6">
        {banner}
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <Building2 className="size-4" />
                  </span>
                  <div className="grid min-w-0 gap-0.5">
                    <CardTitle className="truncate">
                      {account.business?.name ?? t("business")}
                    </CardTitle>
                    <CardDescription className="truncate">
                      {account.full_name}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {account.phone ?? account.email ?? t("linkedAccount")}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-primary/20 overflow-hidden">
          <div aria-hidden className="uae-flag-stripe h-1 w-full" />
          <CardHeader>
            <CardTitle>{ai("portal.vehiclesTitle")}</CardTitle>
            <CardDescription>{ai("portal.vehiclesDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link href="/portal/vehicles" className={buttonVariants({ variant: "secondary" })}>
              {ai("portal.viewVehicle")}
            </Link>
            <Link href="/portal/ai/health-check" className={buttonVariants()}>
              {ai("portal.healthCheckAction")}
            </Link>
          </CardContent>
        </Card>

        <Suspense fallback={<SectionSkeleton rows={2} />}>
          <PendingQuotesSection customerIds={customerIds} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton rows={2} />}>
          <ActiveJobsSection customerIds={customerIds} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton rows={3} />}>
          <ComplaintsSection customerIds={customerIds} />
        </Suspense>
      </div>
    </>
  );
}
