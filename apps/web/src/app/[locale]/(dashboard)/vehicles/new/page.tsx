import Link from "next/link";
import { redirect } from "next/navigation";

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

  return (
    <>
      <PageHeader
        title="Add vehicle"
        description="Create a vehicle record and link it to an existing customer."
        action={
          <Link href="/vehicles" className={buttonVariants({ variant: "outline" })}>
            Back to vehicles
          </Link>
        }
      />
      <div className="p-6">
        {error ? (
          <div className="text-destructive text-sm">{error.message}</div>
        ) : customers.length === 0 ? (
          <EmptyState
            title="No customers yet"
            description="Create a customer first, then add their vehicle."
            action={
              <Link href="/customers/new" className={buttonVariants()}>
                Add customer
              </Link>
            }
          />
        ) : (
          <VehicleForm action={createVehicle} submitLabel="Create vehicle" customers={customers} />
        )}
      </div>
    </>
  );
}
