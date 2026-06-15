import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BrainCircuit, ScanSearch, Wrench } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

import { VehicleIntelligenceSearchBar } from "./vi-search-bar";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return {
    title: t("vehicleIntelligenceTitle"),
    description: t("vehicleIntelligenceDescription"),
  };
}

export default async function VehicleIntelligenceHomePage() {
  const t = await getTranslations("vehicleIntelligence");

  return (
    <>
      <PageHeader title={t("dashboard.title")} description={t("dashboard.description")} />
      <div className="space-y-6 p-6">
        <VehicleIntelligenceSearchBar />

        <div className="grid gap-4 xl:grid-cols-3">
          {[
            {
              href: "/ai/vehicle-diagnosis",
              icon: BrainCircuit,
              title: t("dashboard.diagnosis.title"),
              description: t("dashboard.diagnosis.description"),
              label: t("dashboard.diagnosis.action"),
            },
            {
              href: "/ai/vin-decoder",
              icon: ScanSearch,
              title: t("dashboard.vin.title"),
              description: t("dashboard.vin.description"),
              label: t("dashboard.vin.action"),
            },
            {
              href: "/ai/dtc-decoder",
              icon: Wrench,
              title: t("dashboard.dtc.title"),
              description: t("dashboard.dtc.description"),
              label: t("dashboard.dtc.action"),
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.href}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                      <Icon className="size-5" />
                    </span>
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{item.title}</CardTitle>
                      <CardDescription>{item.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Link href={item.href} className={buttonVariants({ variant: "secondary" })}>
                    {item.label}
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
