import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import { ErrorState } from "@/components/error-state";
import { requireMembership, isSuperAdmin } from "@/lib/auth";
import { canManagePricingTools } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/database.types";
import type { RetainerScenarioRecord } from "@/lib/retainer/types";

import { RetainerCalculator } from "@/components/retainer-calculator/retainer-calculator";

type CustomerRow = Pick<Customer, "id" | "full_name" | "email">;
type ScenarioRow = {
  id: string;
  business_id: string;
  quote_id: string | null;
  created_by: string | null;
  title: string;
  description: string | null;
  customer_id: string | null;
  customer_type: string;
  service_category: string;
  currency: string;
  billing_cycle: string;
  contract_length_months: number;
  number_of_vehicles: number;
  expected_monthly_visits: number;
  sla_level: string;
  labor_items: unknown;
  parts_items: unknown;
  tool_items: unknown;
  overhead_items: unknown;
  risk_settings: unknown;
  pricing_settings: unknown;
  calculated_results: unknown;
  status: string;
  created_at: string;
  updated_at: string;
};

function toScenarioRecord(row: ScenarioRow): RetainerScenarioRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    quoteId: row.quote_id,
    createdBy: row.created_by,
    title: row.title,
    description: row.description ?? undefined,
    customerId: row.customer_id ?? undefined,
    customerType: row.customer_type as RetainerScenarioRecord["customerType"],
    serviceCategory: row.service_category as RetainerScenarioRecord["serviceCategory"],
    input: {
      currency: row.currency as RetainerScenarioRecord["input"]["currency"],
      billingCycle: row.billing_cycle as RetainerScenarioRecord["input"]["billingCycle"],
      contractLengthMonths: row.contract_length_months,
      numberOfVehicles: row.number_of_vehicles,
      expectedMonthlyVisits: row.expected_monthly_visits,
      slaLevel: row.sla_level as RetainerScenarioRecord["input"]["slaLevel"],
      laborItems: row.labor_items as RetainerScenarioRecord["input"]["laborItems"],
      partsItems: row.parts_items as RetainerScenarioRecord["input"]["partsItems"],
      toolItems: row.tool_items as RetainerScenarioRecord["input"]["toolItems"],
      overhead: row.overhead_items as RetainerScenarioRecord["input"]["overhead"],
      risk: row.risk_settings as RetainerScenarioRecord["input"]["risk"],
      pricing: row.pricing_settings as RetainerScenarioRecord["input"]["pricing"],
    },
    status: row.status as RetainerScenarioRecord["status"],
    calculatedResults: row.calculated_results as RetainerScenarioRecord["calculatedResults"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("retainerCalculatorTitle"),
    description: t("retainerCalculatorDescription"),
  };
}

export default async function RetainerCalculatorPage({
  searchParams,
}: {
  searchParams: Promise<{ print?: string; scenario?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslations("retainerCalculator");
  const { member, business } = await requireMembership();
  const allowed = canManagePricingTools(member.role) || (await isSuperAdmin());

  if (!allowed) {
    return (
      <div className="p-6">
        <ErrorState
          title={t("noAccessTitle")}
          description={t("noAccess")}
          backHref="/"
          backLabel={t("backHome")}
        />
      </div>
    );
  }

  const supabase = await createClient();
  const [customersResult, scenariosResult] = await Promise.all([
    supabase
      .from("customers")
      .select("id, full_name, email")
      .eq("business_id", business.id)
      .is("deleted_at", null)
      .order("full_name", { ascending: true }),
    supabase
      .from("retainer_pricing_scenarios")
      .select("*")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false }),
  ]);

  if (customersResult.error || scenariosResult.error) {
    return (
      <div className="p-6">
        <ErrorState
          title={t("errorTitle")}
          description={customersResult.error?.message ?? scenariosResult.error?.message ?? t("errorDescription")}
          backHref="/"
          backLabel={t("backHome")}
        />
      </div>
    );
  }

  const customers = ((customersResult.data ?? []) as CustomerRow[]).map((customer) => ({
    id: customer.id,
    fullName: customer.full_name,
    detail: customer.email ?? t("customer.emailFallback"),
  }));

  const scenarios = ((scenariosResult.data ?? []) as ScenarioRow[]).map(toScenarioRecord);
  const scenario = params.print === "1" && params.scenario
    ? scenarios.find((item) => item.id === params.scenario) ?? null
    : null;

  return (
    <RetainerCalculator
      customers={customers}
      scenarios={scenarios}
      printScenario={scenario}
      isPrint={params.print === "1"}
    />
  );
}
