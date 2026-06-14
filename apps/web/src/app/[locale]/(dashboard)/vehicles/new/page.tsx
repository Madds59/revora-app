import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireMembership } from "@/lib/auth";
import { canManageCustomers } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

import { createVehicle } from "../actions";
import { VehicleForm, type VehicleCustomerOption } from "@/components/vehicle-form";

export default async function NewVehiclePage() {
  const { member, business } = await requireMembership();
  if (!canManageCustomers(member.role)) redirect("/vehicles");

  const supabase = await createClient();
  const { data: customerRows, error } = await supabase
    .from("customers")
    .select("id, full_name, email")
    .eq("business_id", business.id)
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  const customers: VehicleCustomerOption[] = (customerRows ?? []).map((customer) => ({
    id: customer.id,
    label: customer.full_name,
    detail: customer.email ?? undefined,
  }));

  const t = await getTranslations("dashboardVehicles.new");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
          <Link href="/vehicles" className={buttonVariants({ variant: "outline" })}>
            {t("back")}
          </Link>
        }
      />
      <div className="p-6">
        {error ? (
          <div className="text-destructive text-sm">{error.message}</div>
        ) : customers.length === 0 ? (
          <EmptyState
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <Link href="/customers/new" className={buttonVariants()}>
                {t("emptyAction")}
              </Link>
            }
          />
        ) : (
          <VehicleForm action={createVehicle} submitLabel={t("submit")} customers={customers} />
        )}
      </div>
    </>
  );
}
