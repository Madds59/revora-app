import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireMembership } from "@/lib/auth";
import { canManageCustomers } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Customer, Vehicle } from "@/lib/database.types";

import { updateCustomer } from "../actions";
import { CustomerForm } from "../customer-form";
import { AddVehicleForm } from "./vehicle-form";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member } = await requireMembership();
  const canManage = canManageCustomers(member.role);
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!customer) notFound();
  const typedCustomer = customer as Customer;

  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("*")
    .eq("customer_id", id)
    .order("created_at", { ascending: false });
  const typedVehicles = (vehicles ?? []) as Vehicle[];

  return (
    <>
      <PageHeader
        title={typedCustomer.full_name}
        description={
          [typedCustomer.phone, typedCustomer.email]
            .filter(Boolean)
            .join(" · ") || "Customer"
        }
        action={
          <Link
            href="/customers"
            className={buttonVariants({ variant: "outline" })}
          >
            Back to customers
          </Link>
        }
      />
      <div className="p-6">
        <Tabs defaultValue="vehicles">
          <TabsList>
            <TabsTrigger value="vehicles">
              Vehicles ({typedVehicles.length})
            </TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          <TabsContent value="vehicles" className="mt-4 flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Vehicles</CardTitle>
                <CardDescription>
                  Vehicles owned by {typedCustomer.full_name}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {typedVehicles.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No vehicles yet.
                  </p>
                ) : (
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vehicle</TableHead>
                          <TableHead>Year</TableHead>
                          <TableHead>Plate</TableHead>
                          <TableHead>VIN</TableHead>
                          <TableHead>Color</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {typedVehicles.map((v) => (
                          <TableRow key={v.id}>
                            <TableCell className="font-medium">
                              <Link href={`/vehicles/${v.id}`} className="hover:underline">
                                {[v.make, v.model].filter(Boolean).join(" ") ||
                                  "—"}
                              </Link>
                            </TableCell>
                            <TableCell>{v.year ?? "—"}</TableCell>
                            <TableCell>{v.plate_number ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {v.vin ?? "—"}
                            </TableCell>
                            <TableCell>{v.color ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {canManage && (
              <Card>
                <CardHeader>
                  <CardTitle>Add a vehicle</CardTitle>
                </CardHeader>
                <CardContent>
                  <AddVehicleForm customerId={typedCustomer.id} />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="details" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Customer details</CardTitle>
              </CardHeader>
              <CardContent>
                {canManage ? (
                  <CustomerForm
                    action={updateCustomer}
                    customer={typedCustomer}
                    submitLabel="Save changes"
                  />
                ) : (
                  <p className="text-muted-foreground text-sm">
                    You have read-only access to this customer.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
