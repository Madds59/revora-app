import { PageHeader } from "@/components/page-header";
import { requireMembership } from "@/lib/auth";
import { canManageCustomers } from "@/lib/permissions";
import { redirect } from "next/navigation";

import { createCustomer } from "../actions";
import { CustomerForm } from "../customer-form";

export default async function NewCustomerPage() {
  const { member } = await requireMembership();
  if (!canManageCustomers(member.role)) redirect("/customers");

  return (
    <>
      <PageHeader
        title="Add customer"
        description="Create a customer record."
      />
      <div className="p-6">
        <CustomerForm action={createCustomer} submitLabel="Create customer" />
      </div>
    </>
  );
}
