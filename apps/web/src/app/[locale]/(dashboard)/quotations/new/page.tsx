import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { requireMembership } from "@/lib/auth";
import { canManageQuotes } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

import { NewQuoteForm, type CustomerOption } from "./new-quote-form";

type CustomerRow = {
  id: string;
  full_name: string;
  vehicles: {
    id: string;
    make: string | null;
    model: string | null;
    plate_number: string | null;
  }[];
};

export default async function NewQuotePage() {
  const { member } = await requireMembership();
  if (!canManageQuotes(member.role)) redirect("/quotations");
  const supabase = await createClient();

  const { data } = await supabase
    .from("customers")
    .select("id, full_name, vehicles(id, make, model, plate_number)")
    .is("deleted_at", null)
    .order("full_name");
  const rows = (data ?? []) as unknown as CustomerRow[];

  const customers: CustomerOption[] = rows.map((c) => ({
    id: c.id,
    full_name: c.full_name,
    vehicles: c.vehicles.map((v) => ({
      id: v.id,
      label:
        [v.make, v.model].filter(Boolean).join(" ") +
          (v.plate_number ? ` · ${v.plate_number}` : "") || "Vehicle",
    })),
  }));

  return (
    <>
      <PageHeader
        title="New quotation"
        description="Pick the customer to start a draft."
      />
      <div className="p-6">
        {customers.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
            You need a customer first.{" "}
            <Link href="/customers/new" className="text-foreground underline">
              Add a customer
            </Link>
            .
          </div>
        ) : (
          <NewQuoteForm customers={customers} />
        )}
      </div>
    </>
  );
}
