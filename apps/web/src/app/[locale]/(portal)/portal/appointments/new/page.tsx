import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCustomerPortal } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { RequestAppointmentForm } from "../request-appointment-form";

export default async function NewAppointmentPage() {
  const { accounts } = await requireCustomerPortal();
  const supabase = await createClient();

  const businessIds = [...new Set(accounts.map((a) => a.business_id))];
  const customerIds = accounts.map((a) => a.id);

  const [{ data: branchRows }, { data: vehicleRows }] = await Promise.all([
    businessIds.length > 0
      ? supabase.from("branches").select("id, business_id, name").in("business_id", businessIds)
      : Promise.resolve({ data: [] }),
    customerIds.length > 0
      ? supabase
          .from("vehicles")
          .select("id, customer_id, make, model, plate_number")
          .in("customer_id", customerIds)
      : Promise.resolve({ data: [] }),
  ]);

  const accountOptions = accounts.map((account) => ({
    customerId: account.id,
    businessId: account.business_id,
    label: account.business?.name ?? account.full_name ?? "Workshop",
    branches: (branchRows ?? [])
      .filter((b: { business_id: string }) => b.business_id === account.business_id)
      .map((b: { id: string; name: string }) => ({ id: b.id, name: b.name })),
    vehicles: (vehicleRows ?? [])
      .filter((v: { customer_id: string }) => v.customer_id === account.id)
      .map((v: { id: string; make: string | null; model: string | null; plate_number: string | null }) => ({
        id: v.id,
        label:
          [v.make, v.model].filter(Boolean).join(" ") +
          (v.plate_number ? ` · ${v.plate_number}` : ""),
      })),
  }));

  const hasBranch = accountOptions.some((a) => a.branches.length > 0);

  return (
    <>
      <PageHeader title="Request an appointment" description="Pick a time and we'll confirm it." />
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Appointment details</CardTitle>
          </CardHeader>
          <CardContent>
            {accountOptions.length === 0 || !hasBranch ? (
              <div className="flex flex-col gap-3">
                <p className="text-muted-foreground text-sm">
                  No linked workshop with an available branch was found for your account.
                </p>
                <Link href="/portal" className={buttonVariants({ variant: "outline" })}>
                  Back to portal
                </Link>
              </div>
            ) : (
              <RequestAppointmentForm accounts={accountOptions.filter((a) => a.branches.length > 0)} />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
