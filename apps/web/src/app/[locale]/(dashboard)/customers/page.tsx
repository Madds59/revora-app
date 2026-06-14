import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/database.types";

export default async function CustomersPage() {
  const { business } = await requireMembership();
  const supabase = await createClient();

  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, full_name, phone, email, created_at")
    .eq("business_id", business.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader
        title="Customers"
        description="People and businesses you serve."
        action={
          <Link href="/customers/new" className={buttonVariants()}>
            Add customer
          </Link>
        }
      />
      <div className="p-6">
        {error ? (
          <p className="text-destructive text-sm">{error.message}</p>
        ) : !customers || customers.length === 0 ? (
          <EmptyState
            title="No customers yet"
            description="Add your first customer to start linking vehicles, quotes, jobs, and documents."
            action={
              <Link href="/customers/new" className={buttonVariants({ variant: "secondary" })}>
                Add your first customer
              </Link>
            }
          />
        ) : (
          <>
            <MobileDataList
              items={customers as Pick<
                Customer,
                "id" | "full_name" | "phone" | "email" | "created_at"
              >[]}
              empty={null}
              getKey={(customer) => customer.id}
              renderItem={(customer) => (
                <MobileDataCard
                  title={
                    <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">
                      {customer.full_name}
                    </Link>
                  }
                  subtitle={customer.email ?? "No email"}
                  meta={customer.phone ?? "No phone"}
                />
              )}
            />

            <div className="hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(customers as Pick<
                    Customer,
                    "id" | "full_name" | "phone" | "email" | "created_at"
                  >[]).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link
                          href={`/customers/${c.id}`}
                          className="font-medium hover:underline"
                        >
                          {c.full_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.phone ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.email ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
