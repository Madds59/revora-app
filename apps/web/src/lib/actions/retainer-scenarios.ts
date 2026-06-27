"use server";

import { revalidatePath } from "next/cache";

import { getUser, isSuperAdmin, requireMembership } from "@/lib/auth";
import { canManagePricingTools } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { computeTotals } from "@/lib/money";
import type { Json } from "@/lib/database.types";
import { calculateRetainer } from "@/lib/retainer/calculate-retainer.js";
import {
  retainerScenarioIdsSchema,
  retainerScenarioSaveSchema,
} from "@/lib/retainer/retainer-schema";
import type {
  RetainerScenarioInput,
  RetainerScenarioRecord,
  RetainerComparison,
  RetainerCalculationInput,
  RetainerCalculationResult,
} from "@/lib/retainer/types";
import { buildRetainerQuoteLine, buildRetainerQuoteNotes } from "@/lib/retainer/quote.js";
import { trackRetainerEvent } from "@/lib/analytics/track";

export type FormState<T = unknown> = {
  error?: string;
  message?: string;
  result?: T;
};

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
  labor_items: Json;
  parts_items: Json;
  tool_items: Json;
  overhead_items: Json;
  risk_settings: Json;
  pricing_settings: Json;
  calculated_results: Json;
  status: string;
  created_at: string;
  updated_at: string;
};

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function parseJson<T>(value: string, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toRecord(row: ScenarioRow): RetainerScenarioRecord {
  const input = {
    currency: row.currency as RetainerCalculationInput["currency"],
    billingCycle: row.billing_cycle as RetainerCalculationInput["billingCycle"],
    contractLengthMonths: row.contract_length_months,
    numberOfVehicles: row.number_of_vehicles,
    expectedMonthlyVisits: Number(row.expected_monthly_visits),
    slaLevel: row.sla_level as RetainerCalculationInput["slaLevel"],
    laborItems: row.labor_items as unknown as RetainerCalculationInput["laborItems"],
    partsItems: row.parts_items as unknown as RetainerCalculationInput["partsItems"],
    toolItems: row.tool_items as unknown as RetainerCalculationInput["toolItems"],
    overhead: row.overhead_items as unknown as RetainerCalculationInput["overhead"],
    risk: row.risk_settings as unknown as RetainerCalculationInput["risk"],
    pricing: row.pricing_settings as unknown as RetainerCalculationInput["pricing"],
  };

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
    input,
    status: row.status as RetainerScenarioRecord["status"],
    calculatedResults: row.calculated_results as unknown as RetainerCalculationResult,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function guardPricingAccess() {
  const { member, business } = await requireMembership();
  const user = await getUser();
  const allowed =
    canManagePricingTools(member.role) ||
    member.role === "super_admin" ||
    (await isSuperAdmin());

  if (!allowed) {
    return {
      error: "Only the business owner or business manager can manage retainer scenarios.",
    } as const;
  }

  return { member, business, user } as const;
}

async function loadScenarioForBusiness(businessId: string, scenarioId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("retainer_pricing_scenarios")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", scenarioId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ScenarioRow;
}

async function loadScenariosForBusiness(businessId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("retainer_pricing_scenarios")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data as ScenarioRow[]).map(toRecord);
}

async function persistScenario(
  input: RetainerScenarioInput & { id?: string; status?: RetainerScenarioRecord["status"] },
  businessId: string,
  userId: string | null,
  existingStatus?: RetainerScenarioRecord["status"],
) {
  const normalized = retainerScenarioSaveSchema.parse(input);
  const calculated = calculateRetainer(normalized.input);
  const supabase = await createClient();

  const payload = {
    business_id: businessId,
    title: normalized.title,
    description: normalized.description ?? null,
    customer_id: normalized.customerId ?? null,
    customer_type: normalized.customerType,
    service_category: normalized.serviceCategory,
    currency: normalized.input.currency,
    billing_cycle: normalized.input.billingCycle,
    contract_length_months: normalized.input.contractLengthMonths,
    number_of_vehicles: normalized.input.numberOfVehicles,
    expected_monthly_visits: normalized.input.expectedMonthlyVisits,
    sla_level: normalized.input.slaLevel,
    labor_items: normalized.input.laborItems as Json,
    parts_items: normalized.input.partsItems as Json,
    tool_items: normalized.input.toolItems as Json,
    overhead_items: normalized.input.overhead as Json,
    risk_settings: normalized.input.risk as Json,
    pricing_settings: normalized.input.pricing as Json,
    calculated_results: calculated as unknown as Json,
    status: input.status ?? existingStatus ?? "draft",
    ...(input.id ? {} : { created_by: userId }),
  };

  if (input.id) {
    const { error } = await supabase
      .from("retainer_pricing_scenarios")
      .update(payload)
      .eq("business_id", businessId)
      .eq("id", input.id);
    if (error) {
      console.error("persistScenario (update) failed", error);
      return { error: "Could not save scenario." } as const;
    }
    return { scenarioId: input.id, calculated } as const;
  }

  const { data, error } = await supabase
    .from("retainer_pricing_scenarios")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data) {
    if (error) console.error("persistScenario (insert) failed", error);
    return { error: "Could not save scenario." } as const;
  }
  return { scenarioId: data.id, calculated } as const;
}

export async function listRetainerScenarios() {
  const access = await guardPricingAccess();
  if ("error" in access) return { error: access.error, result: [] as RetainerScenarioRecord[] };
  const result = await loadScenariosForBusiness(access.business.id);
  return { result };
}

export async function getRetainerScenario(id: string) {
  const access = await guardPricingAccess();
  if ("error" in access) return { error: access.error, result: null };
  const row = await loadScenarioForBusiness(access.business.id, id);
  return { result: row ? toRecord(row) : null };
}

export async function createRetainerScenario(
  _prev: FormState<RetainerScenarioRecord>,
  formData: FormData,
): Promise<FormState<RetainerScenarioRecord>> {
  const access = await guardPricingAccess();
  if ("error" in access) return { error: access.error };

  const payload = parseJson(str(formData, "payload"), null as unknown as RetainerScenarioInput);
  const parsed = retainerScenarioSaveSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: "Check the scenario inputs and try again." };
  }

  const saved = await persistScenario(parsed.data, access.business.id, access.user?.id ?? null);
  if ("error" in saved) return { error: saved.error };
  const created = await loadScenarioForBusiness(access.business.id, saved.scenarioId);
  if (!created) return { error: "Could not reload the saved scenario." };

  await trackRetainerEvent("retainer_scenario_saved", {
    business_id: access.business.id,
    role: access.member.role,
    service_category: parsed.data.serviceCategory,
    billing_cycle: parsed.data.input.billingCycle,
  });

  revalidatePath("/tools/retainer-calculator");
  return {
    message: "Scenario saved.",
    result: toRecord(created),
  };
}

export async function saveRetainerScenario(
  prev: FormState<RetainerScenarioRecord>,
  formData: FormData,
): Promise<FormState<RetainerScenarioRecord>> {
  const payload = parseJson(str(formData, "payload"), null as unknown as RetainerScenarioInput);
  const parsed = retainerScenarioSaveSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: "Check the scenario inputs and try again." };
  }

  if (parsed.data.id) {
    return updateRetainerScenario(prev, formData);
  }

  return createRetainerScenario(prev, formData);
}

export async function updateRetainerScenario(
  _prev: FormState<RetainerScenarioRecord>,
  formData: FormData,
): Promise<FormState<RetainerScenarioRecord>> {
  const access = await guardPricingAccess();
  if ("error" in access) return { error: access.error };

  const payload = parseJson(str(formData, "payload"), null as unknown as RetainerScenarioInput);
  const parsed = retainerScenarioSaveSchema.safeParse(payload);
  if (!parsed.success || !parsed.data.id) {
    return { error: "Select a scenario to update." };
  }

  const existing = await loadScenarioForBusiness(access.business.id, parsed.data.id);
  if (!existing) return { error: "Scenario not found." };

  const saved = await persistScenario(
    parsed.data,
    access.business.id,
    access.user?.id ?? null,
    existing.status as RetainerScenarioRecord["status"],
  );
  if ("error" in saved) return { error: saved.error };
  const updated = await loadScenarioForBusiness(access.business.id, parsed.data.id);
  if (!updated) return { error: "Could not reload the updated scenario." };

  if (existing.quote_id) {
    revalidatePath(`/quotations/${existing.quote_id}`);
  }

  await trackRetainerEvent("retainer_scenario_updated", {
    business_id: access.business.id,
    role: access.member.role,
    service_category: parsed.data.serviceCategory,
    billing_cycle: parsed.data.input.billingCycle,
  });

  revalidatePath("/tools/retainer-calculator");
  return {
    message: "Scenario updated.",
    result: toRecord(updated),
  };
}

export async function deleteRetainerScenario(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await guardPricingAccess();
  if ("error" in access) return { error: access.error };

  const id = str(formData, "id");
  if (!id) return { error: "Missing scenario id." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("retainer_pricing_scenarios")
    .delete()
    .eq("business_id", access.business.id)
    .eq("id", id);
  if (error) {
    console.error("deleteRetainerScenario failed", error);
    return { error: "Could not delete scenario." };
  }

  revalidatePath("/tools/retainer-calculator");
  return { message: "Scenario deleted." };
}

export async function duplicateRetainerScenario(
  _prev: FormState<RetainerScenarioRecord>,
  formData: FormData,
): Promise<FormState<RetainerScenarioRecord>> {
  const access = await guardPricingAccess();
  if ("error" in access) return { error: access.error };

  const id = str(formData, "id");
  if (!id) return { error: "Missing scenario id." };

  const existing = await loadScenarioForBusiness(access.business.id, id);
  if (!existing) return { error: "Scenario not found." };

  const source = toRecord(existing);
  const saved = await persistScenario(
    {
      ...source,
      id: undefined,
      title: `${source.title} (Copy)`,
      status: "draft",
      customerId: source.customerId,
      description: source.description,
      customerType: source.customerType,
      serviceCategory: source.serviceCategory,
      input: source.input,
    },
    access.business.id,
    access.user?.id ?? null,
    "draft",
  );

  if ("error" in saved) return { error: saved.error };
  const duplicated = await loadScenarioForBusiness(access.business.id, saved.scenarioId);
  if (!duplicated) return { error: "Could not reload the duplicated scenario." };

  await trackRetainerEvent("retainer_scenario_duplicated", {
    business_id: access.business.id,
    role: access.member.role,
    service_category: source.serviceCategory,
    billing_cycle: source.input.billingCycle,
  });

  revalidatePath("/tools/retainer-calculator");
  return {
    message: "Scenario duplicated.",
    result: toRecord(duplicated),
  };
}

export async function compareRetainerScenarios(
  _prev: FormState<RetainerComparison & { scenarios: RetainerScenarioRecord[] }>,
  formData: FormData,
): Promise<FormState<RetainerComparison & { scenarios: RetainerScenarioRecord[] }>> {
  const access = await guardPricingAccess();
  if ("error" in access) return { error: access.error };

  const payload = parseJson<{ ids: string[] }>(str(formData, "payload"), { ids: [] });
  const parsed = retainerScenarioIdsSchema.safeParse(payload);
  if (!parsed.success) return { error: "Select at least two scenarios to compare." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("retainer_pricing_scenarios")
    .select("*")
    .eq("business_id", access.business.id)
    .in("id", parsed.data.ids);
  if (error) {
    console.error("compareRetainerScenarios failed", error);
    return { error: "Could not load scenarios to compare." };
  }

  const scenarios = (data ?? []).map((row) => toRecord(row as ScenarioRow));
  if (scenarios.length < 2) {
    return { error: "Select at least two saved scenarios to compare." };
  }

  const base = scenarios[0];
  const spreadMonthly = Math.max(...scenarios.map((scenario) => scenario.calculatedResults.finalMonthlyRetainer)) -
    Math.min(...scenarios.map((scenario) => scenario.calculatedResults.finalMonthlyRetainer));
  const spreadMargin = Math.max(...scenarios.map((scenario) => scenario.calculatedResults.grossMargin)) -
    Math.min(...scenarios.map((scenario) => scenario.calculatedResults.grossMargin));

  const recommendations = [
    `Base comparison: ${base.title}`,
    spreadMonthly > 0 ? "Review the monthly retainer spread before presenting tiers." : "The selected scenarios are priced similarly.",
  ];

  await trackRetainerEvent("retainer_scenarios_compared", {
    business_id: access.business.id,
    role: access.member.role,
  });

  revalidatePath("/tools/retainer-calculator");
  return {
    message: "Scenarios compared.",
    result: {
      baseScenarioId: base.id,
      scenarioIds: scenarios.map((scenario) => scenario.id),
      totalMonthlySpread: spreadMonthly,
      marginSpread: spreadMargin,
      recommendations,
      scenarios,
    },
  };
}

export async function convertScenarioToQuote(
  _prev: FormState<{ quoteId: string; quoteNumber: string; scenarioId: string }>,
  formData: FormData,
): Promise<FormState<{ quoteId: string; quoteNumber: string; scenarioId: string }>> {
  const access = await guardPricingAccess();
  if ("error" in access) return { error: access.error };

  const scenarioId = str(formData, "id");
  if (!scenarioId) return { error: "Missing scenario id." };

  const scenarioRow = await loadScenarioForBusiness(access.business.id, scenarioId);
  if (!scenarioRow) return { error: "Scenario not found." };

  const scenario = toRecord(scenarioRow);
  if (!scenario.customerId) {
    return { error: "Attach the scenario to a customer before creating a quote." };
  }

  const supabase = await createClient();
  const { data: quoteId, error: quoteError } = await supabase.rpc("create_quotation_draft", {
    target_business_id: access.business.id,
    target_customer_id: scenario.customerId,
    target_vehicle_id: undefined,
    target_created_by: access.user?.id ?? undefined,
    target_currency: scenario.input.currency,
  });

  if (quoteError || !quoteId) {
    if (quoteError) console.error("convertScenarioToQuote (create draft) failed", quoteError);
    return { error: "Could not create the quotation." };
  }

  const quoteLine = buildRetainerQuoteLine(scenario, access.business.id, quoteId);
  const quoteNotes = buildRetainerQuoteNotes(scenario);

  const { error: itemError } = await supabase.from("quotation_items").insert(quoteLine);
  if (itemError) {
    console.error("convertScenarioToQuote (insert item) failed", itemError);
    return { error: "Could not create the quotation." };
  }

  const { data: items } = await supabase
    .from("quotation_items")
    .select("quantity, unit_price, discount_amount, tax_rate")
    .eq("quotation_id", quoteId);
  const totals = computeTotals((items ?? []) as Parameters<typeof computeTotals>[0]);

  const { error: quoteUpdateError } = await supabase
    .from("quotations")
    .update({
      ...quoteNotes,
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      tax_total: totals.tax_total,
      total: totals.total,
    })
    .eq("id", quoteId);
  if (quoteUpdateError) {
    console.error("convertScenarioToQuote (update totals) failed", quoteUpdateError);
    return { error: "Could not create the quotation." };
  }

  const { error: scenarioUpdateError } = await supabase
    .from("retainer_pricing_scenarios")
    .update({
      quote_id: quoteId,
      status: "converted_to_quote",
      calculated_results: scenario.calculatedResults as unknown as Json,
    })
    .eq("business_id", access.business.id)
    .eq("id", scenario.id);
  if (scenarioUpdateError) {
    console.error("convertScenarioToQuote (update scenario) failed", scenarioUpdateError);
    return { error: "Could not create the quotation." };
  }

  const { data: quoteRow } = await supabase
    .from("quotations")
    .select("quote_number")
    .eq("id", quoteId)
    .maybeSingle();

  await trackRetainerEvent("retainer_quote_created", {
    business_id: access.business.id,
    role: access.member.role,
    service_category: scenario.serviceCategory,
    billing_cycle: scenario.input.billingCycle,
  });

  revalidatePath(`/quotations/${quoteId}`);
  revalidatePath("/quotations");
  revalidatePath("/tools/retainer-calculator");
  return {
    message: "Quote created from scenario.",
    result: {
      quoteId,
      quoteNumber: quoteRow?.quote_number ?? "",
      scenarioId: scenario.id,
    },
  };
}
