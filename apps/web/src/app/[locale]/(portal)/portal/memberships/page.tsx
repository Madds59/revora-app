import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { requireCustomerPortal } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import { MembershipPlans, type PortalBundle } from "@/components/membership-bundles/membership-plans";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("bundles");
  return { title: t("portal.title"), description: t("portal.subtitle") };
}

type BundleRow = {
  id: string;
  business_id: string;
  name: string;
  tier: string;
  description: string | null;
  currency: string;
  billing_cycle: string;
  price: number;
  included_visits: number;
  sla_level: string;
  features: Json;
};

export default async function PortalMembershipsPage() {
  const t = await getTranslations("bundles");
  const { accounts } = await requireCustomerPortal();
  const businessNames = new Map(accounts.map((a) => [a.business_id, a.business?.name ?? ""]));
  const businessIds = [...businessNames.keys()];

  const supabase = await createClient();
  const { data } = businessIds.length
    ? await supabase
        .from("membership_bundles")
        .select("id, business_id, name, tier, description, currency, billing_cycle, price, included_visits, sla_level, features")
        .in("business_id", businessIds)
        .eq("is_published", true)
        .order("sort_order", { ascending: true })
    : { data: [] };

  const bundles: PortalBundle[] = ((data ?? []) as BundleRow[]).map((row) => ({
    id: row.id,
    businessName: businessNames.get(row.business_id) ?? "",
    name: row.name,
    tier: row.tier as PortalBundle["tier"],
    description: row.description ?? "",
    currency: row.currency,
    billingCycle: row.billing_cycle,
    price: Number(row.price),
    includedVisits: Number(row.included_visits),
    slaLevel: row.sla_level as PortalBundle["slaLevel"],
  }));

  return (
    <>
      <PageHeader title={t("portal.title")} description={t("portal.subtitle")} />
      <div className="p-4 sm:p-6">
        <MembershipPlans bundles={bundles} />
      </div>
    </>
  );
}
