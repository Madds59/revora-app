import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import { ErrorState } from "@/components/error-state";
import { requireMembership, isSuperAdmin } from "@/lib/auth";
import { canManagePricingTools } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/database.types";
import { listMembershipBundles } from "@/lib/actions/membership-bundles";
import { MembershipBundlesManager } from "@/components/membership-bundles/membership-bundles-manager";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("bundles");
  return { title: t("manageTitle"), description: t("manageSubtitle") };
}

export default async function MembershipBundlesPage() {
  const t = await getTranslations("bundles");
  const { member, business } = await requireMembership();
  const allowed = canManagePricingTools(member.role) || (await isSuperAdmin());

  if (!allowed) {
    return (
      <div className="p-6">
        <ErrorState title={t("manageTitle")} description={t("states.denied")} backHref="/" backLabel={t("backHome")} />
      </div>
    );
  }

  const supabase = await createClient();
  const [bundlesResult, customersResult, scenariosResult] = await Promise.all([
    listMembershipBundles(),
    supabase
      .from("customers")
      .select("id, full_name")
      .eq("business_id", business.id)
      .is("deleted_at", null)
      .order("full_name", { ascending: true }),
    supabase
      .from("retainer_pricing_scenarios")
      .select("id, title")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false }),
  ]);

  const customers = ((customersResult.data ?? []) as Pick<Customer, "id" | "full_name">[]).map((c) => ({
    id: c.id,
    name: c.full_name,
  }));
  const scenarios = ((scenariosResult.data ?? []) as { id: string; title: string }[]).map((s) => ({
    id: s.id,
    title: s.title,
  }));

  return (
    <MembershipBundlesManager
      bundles={bundlesResult.result ?? []}
      customers={customers}
      scenarios={scenarios}
    />
  );
}
