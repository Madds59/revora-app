import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

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

function formatCustomerLabel(fullName: string | null | undefined, fallback: string) {
  const label = fullName?.trim();
  return label ? label : fallback;
}

function formatVehicleLabel(
  vehicle: {
    make: string | null;
    model: string | null;
    plate_number: string | null;
  },
  fallback: string,
) {
  const makeModel = [vehicle.make?.trim(), vehicle.model?.trim()].filter(Boolean).join(" ");
  const plate = vehicle.plate_number?.trim();

  if (makeModel && plate) return `${makeModel} · ${plate}`;
  if (makeModel) return makeModel;
  if (plate) return plate;
  return fallback;
}

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

  const t = await getTranslations("dashboardQuotations.new");
  const tFallback = await getTranslations("dashboardQuotations.fallback");

  const customers: CustomerOption[] = rows.map((c) => ({
    id: c.id,
    full_name: formatCustomerLabel(c.full_name, tFallback("unknownCustomer")),
    vehicles: c.vehicles.map((v) => ({
      id: v.id,
      label: formatVehicleLabel(v, tFallback("unknownVehicle")),
    })),
  }));

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />
      <div className="p-6">
        {customers.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
            {t("needCustomer")}{" "}
            <Link href="/customers/new" className="text-foreground underline">
              {t("addCustomer")}
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
