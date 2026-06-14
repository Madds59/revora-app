import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireMembership } from "@/lib/auth";
import { canManageCustomers } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

import { updateVehicle } from "../../actions";
import { VehicleForm, type VehicleCustomerOption } from "@/components/vehicle-form";

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member, business } = await requireMembership();
  if (!canManageCustomers(member.role)) redirect("/vehicles");

  const supabase = await createClient();
  const [
    { data: vehicleRow, error: vehicleError },
    { data: customerRows, error },
  ] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, customer_id, make, model, year, plate_number, vin, color, customer:customers(id, full_name, email)")
      .eq("business_id", business.id)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("customers")
      .select("id, full_name, email")
      .eq("business_id", business.id)
      .is("deleted_at", null)
      .order("full_name", { ascending: true }),
  ]);

  if (vehicleError) {
    throw vehicleError;
  }
  if (!vehicleRow) notFound();
  const vehicle = vehicleRow as unknown as {
    id: string;
    customer_id: string;
    make: string | null;
    model: string | null;
    year: number | null;
    plate_number: string | null;
    vin: string | null;
    color: string | null;
  };

  const customers: VehicleCustomerOption[] = (customerRows ?? []).map((customer) => ({
    id: customer.id,
    label: customer.full_name,
    detail: customer.email ?? undefined,
  }));

  return (
    <>
      <PageHeader
        title="Edit vehicle"
        description="Update the vehicle and keep it linked to the correct customer."
        action={
          <Link href={`/vehicles/${id}`} className={buttonVariants({ variant: "outline" })}>
            Back to vehicle
          </Link>
        }
      />
      <div className="p-6">
        {error ? (
          <div className="text-destructive text-sm">{error.message}</div>
        ) : customers.length === 0 ? (
          <EmptyState
            title="No customers yet"
            description="Create or restore a customer before editing vehicle ownership."
            action={
              <Link href="/customers/new" className={buttonVariants()}>
                Add customer
              </Link>
            }
          />
        ) : (
          <VehicleForm
            action={updateVehicle}
            submitLabel="Save changes"
            vehicle={vehicle}
            customers={customers}
          />
        )}
      </div>
    </>
  );
}
