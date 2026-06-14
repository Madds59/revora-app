import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { requireMembership } from "@/lib/auth";
import { canManageCustomers } from "@/lib/permissions";
import { redirect } from "next/navigation";

import { createCustomer } from "../actions";
import { CustomerForm } from "../customer-form";

export default async function NewCustomerPage() {
  const { member } = await requireMembership();
  if (!canManageCustomers(member.role)) redirect("/customers");

  const t = await getTranslations("dashboardCustomers.new");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />
      <div className="p-6">
        <CustomerForm action={createCustomer} submitLabel={t("submit")} />
      </div>
    </>
  );
}
