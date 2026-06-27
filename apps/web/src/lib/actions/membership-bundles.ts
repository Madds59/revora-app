"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getUser, isSuperAdmin, requireCustomerPortal, requireMembership } from "@/lib/auth";
import { canManagePricingTools } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { computeTotals } from "@/lib/money";
import type { Json } from "@/lib/database.types";
import { bundleDraftSchema, generateBundlesSchema } from "@/lib/bundles/schema";
import { buildBundlesFromScenario } from "@/lib/bundles/generate.js";
import type {
  MembershipBundleDraft,
  MembershipBundleRecord,
} from "@/lib/bundles/types";
import type { RetainerScenarioRecord } from "@/lib/retainer/types";
import { trackRetainerEvent } from "@/lib/analytics/track";

export type FormState<T = unknown> = {
  error?: string;
  message?: string;
  result?: T;
};

type BundleRow = {
  id: string;
  business_id: string;
  scenario_id: string | null;
  created_by: string | null;
  name: string;
  tier: string;
  description: string | null;
  currency: string;
  billing_cycle: string;
  price: number;
  included_visits: number;
  included_labor_hours: number;
  sla_level: string;
  features: Json;
  is_published: boolean;
  sort_order: number;
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

function toBundleRecord(row: BundleRow): MembershipBundleRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    scenarioId: row.scenario_id,
    createdBy: row.created_by,
    name: row.name,
    tier: row.tier as MembershipBundleRecord["tier"],
    description: row.description ?? undefined,
    currency: row.currency as MembershipBundleRecord["currency"],
    billingCycle: row.billing_cycle as MembershipBundleRecord["billingCycle"],
    price: Number(row.price),
    includedVisits: Number(row.included_visits),
    includedLaborHours: Number(row.included_labor_hours),
    slaLevel: row.sla_level as MembershipBundleRecord["slaLevel"],
    features: (row.features as unknown as MembershipBundleRecord["features"]) ?? [],
    isPublished: row.is_published,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function draftToPayload(draft: MembershipBundleDraft, businessId: string) {
  return {
    business_id: businessId,
    scenario_id: draft.scenarioId ?? null,
    name: draft.name,
    tier: draft.tier,
    description: draft.description ?? null,
    currency: draft.currency,
    billing_cycle: draft.billingCycle,
    price: draft.price,
    included_visits: draft.includedVisits,
    included_labor_hours: draft.includedLaborHours,
    sla_level: draft.slaLevel,
    features: draft.features as unknown as Json,
    is_published: draft.isPublished,
    sort_order: draft.sortOrder,
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
      error: "Only the business owner or business manager can manage membership bundles.",
    } as const;
  }
  return { member, business, user } as const;
}

async function loadBundle(businessId: string, id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("membership_bundles")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as BundleRow;
}

// --- reads --------------------------------------------------------------

export async function listMembershipBundles() {
  const access = await guardPricingAccess();
  if ("error" in access) return { error: access.error, result: [] as MembershipBundleRecord[] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("membership_bundles")
    .select("*")
    .eq("business_id", access.business.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listMembershipBundles failed", error);
    return { error: "Could not load bundles.", result: [] as MembershipBundleRecord[] };
  }
  return { result: (data as BundleRow[]).map(toBundleRecord) };
}

export async function getMembershipBundle(id: string) {
  const access = await guardPricingAccess();
  if ("error" in access) return { error: access.error, result: null };
  const row = await loadBundle(access.business.id, id);
  return { result: row ? toBundleRecord(row) : null };
}

/** Portal/customer read of a business's published bundles (RLS-scoped). */
export async function listPublishedBundles(businessId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("membership_bundles")
    .select("*")
    .eq("business_id", businessId)
    .eq("is_published", true)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("listPublishedBundles failed", error);
    return { error: "Could not load bundles.", result: [] as MembershipBundleRecord[] };
  }
  return { result: (data as BundleRow[]).map(toBundleRecord) };
}

// --- mutations ----------------------------------------------------------

export async function createMembershipBundle(
  _prev: FormState<MembershipBundleRecord>,
  formData: FormData,
): Promise<FormState<MembershipBundleRecord>> {
  const access = await guardPricingAccess();
  if ("error" in access) return { error: access.error };

  const parsed = bundleDraftSchema.safeParse(parseJson(str(formData, "payload"), null));
  if (!parsed.success) return { error: "Check the bundle inputs and try again." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("membership_bundles")
    .insert({ ...draftToPayload(parsed.data, access.business.id), created_by: access.user?.id ?? null })
    .select("*")
    .single();
  if (error || !data) {
    if (error) console.error("createMembershipBundle failed", error);
    return { error: "Could not create the bundle." };
  }

  revalidatePath("/tools/membership-bundles");
  return { message: "Bundle created.", result: toBundleRecord(data as BundleRow) };
}

export async function updateMembershipBundle(
  _prev: FormState<MembershipBundleRecord>,
  formData: FormData,
): Promise<FormState<MembershipBundleRecord>> {
  const access = await guardPricingAccess();
  if ("error" in access) return { error: access.error };

  const id = str(formData, "id");
  if (!id) return { error: "Missing bundle id." };
  const parsed = bundleDraftSchema.safeParse(parseJson(str(formData, "payload"), null));
  if (!parsed.success) return { error: "Check the bundle inputs and try again." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("membership_bundles")
    .update(draftToPayload(parsed.data, access.business.id))
    .eq("business_id", access.business.id)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    if (error) console.error("updateMembershipBundle failed", error);
    return { error: "Could not update the bundle." };
  }

  revalidatePath("/tools/membership-bundles");
  return { message: "Bundle updated.", result: toBundleRecord(data as BundleRow) };
}

export async function deleteMembershipBundle(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await guardPricingAccess();
  if ("error" in access) return { error: access.error };
  const id = str(formData, "id");
  if (!id) return { error: "Missing bundle id." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("membership_bundles")
    .delete()
    .eq("business_id", access.business.id)
    .eq("id", id);
  if (error) {
    console.error("deleteMembershipBundle failed", error);
    return { error: "Could not delete the bundle." };
  }

  revalidatePath("/tools/membership-bundles");
  return { message: "Bundle deleted." };
}

export async function setMembershipBundlePublished(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await guardPricingAccess();
  if ("error" in access) return { error: access.error };
  const id = str(formData, "id");
  const publish = str(formData, "publish") === "true";
  if (!id) return { error: "Missing bundle id." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("membership_bundles")
    .update({ is_published: publish })
    .eq("business_id", access.business.id)
    .eq("id", id);
  if (error) {
    console.error("setMembershipBundlePublished failed", error);
    return { error: "Could not update the bundle." };
  }

  revalidatePath("/tools/membership-bundles");
  return { message: publish ? "Bundle published." : "Bundle unpublished." };
}

export async function reorderMembershipBundles(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await guardPricingAccess();
  if ("error" in access) return { error: access.error };

  const order = z
    .array(z.string().uuid())
    .safeParse(parseJson(str(formData, "payload"), [] as string[]));
  if (!order.success) return { error: "Invalid ordering." };

  const supabase = await createClient();
  for (let index = 0; index < order.data.length; index += 1) {
    const { error } = await supabase
      .from("membership_bundles")
      .update({ sort_order: index })
      .eq("business_id", access.business.id)
      .eq("id", order.data[index]);
    if (error) {
      console.error("reorderMembershipBundles failed", error);
      return { error: "Could not save the new order." };
    }
  }

  revalidatePath("/tools/membership-bundles");
  return { message: "Order updated." };
}

export async function generateBundlesFromScenario(
  _prev: FormState<MembershipBundleRecord[]>,
  formData: FormData,
): Promise<FormState<MembershipBundleRecord[]>> {
  const access = await guardPricingAccess();
  if ("error" in access) return { error: access.error };

  const parsed = generateBundlesSchema.safeParse({ scenarioId: str(formData, "scenarioId") });
  if (!parsed.success) return { error: "Select a scenario." };

  const supabase = await createClient();
  const { data: scenarioRow, error: scenarioError } = await supabase
    .from("retainer_pricing_scenarios")
    .select("*")
    .eq("business_id", access.business.id)
    .eq("id", parsed.data.scenarioId)
    .maybeSingle();
  if (scenarioError || !scenarioRow) return { error: "Scenario not found." };

  // Server-recomputed: prices/scope come from the tier math, not client values.
  const scenario = {
    id: scenarioRow.id,
    businessId: scenarioRow.business_id,
    title: scenarioRow.title,
    description: scenarioRow.description ?? undefined,
    input: {
      currency: scenarioRow.currency,
      billingCycle: scenarioRow.billing_cycle,
      contractLengthMonths: scenarioRow.contract_length_months,
      numberOfVehicles: scenarioRow.number_of_vehicles,
      expectedMonthlyVisits: Number(scenarioRow.expected_monthly_visits),
      slaLevel: scenarioRow.sla_level,
      laborItems: scenarioRow.labor_items,
      partsItems: scenarioRow.parts_items,
      toolItems: scenarioRow.tool_items,
      overhead: scenarioRow.overhead_items,
      risk: scenarioRow.risk_settings,
      pricing: scenarioRow.pricing_settings,
    },
  } as unknown as RetainerScenarioRecord;

  const drafts = buildBundlesFromScenario(scenario);
  const { data: existing } = await supabase
    .from("membership_bundles")
    .select("sort_order")
    .eq("business_id", access.business.id)
    .order("sort_order", { ascending: false })
    .limit(1);
  const offset = existing && existing.length > 0 ? Number(existing[0].sort_order) + 1 : 0;

  const rows = drafts.map((draft, index) => ({
    ...draftToPayload({ ...draft, sortOrder: offset + index }, access.business.id),
    created_by: access.user?.id ?? null,
  }));
  const { data, error } = await supabase.from("membership_bundles").insert(rows).select("*");
  if (error || !data) {
    if (error) console.error("generateBundlesFromScenario failed", error);
    return { error: "Could not generate bundles." };
  }

  await trackRetainerEvent("membership_bundles_generated", {
    business_id: access.business.id,
    role: access.member.role,
  });

  revalidatePath("/tools/membership-bundles");
  return {
    message: "Tiers generated from scenario.",
    result: (data as BundleRow[]).map(toBundleRecord),
  };
}

/** Owner/manager creates a real quotation for a customer from a bundle. */
export async function createQuoteFromBundle(
  _prev: FormState<{ quoteId: string; quoteNumber: string }>,
  formData: FormData,
): Promise<FormState<{ quoteId: string; quoteNumber: string }>> {
  const access = await guardPricingAccess();
  if ("error" in access) return { error: access.error };

  const bundleId = str(formData, "bundleId");
  const customerId = str(formData, "customerId");
  if (!bundleId || !customerId) return { error: "Select a bundle and a customer." };

  const bundleRow = await loadBundle(access.business.id, bundleId);
  if (!bundleRow) return { error: "Bundle not found." };
  const bundle = toBundleRecord(bundleRow);

  const supabase = await createClient();
  const { data: quoteId, error: quoteError } = await supabase.rpc("create_quotation_draft", {
    target_business_id: access.business.id,
    target_customer_id: customerId,
    target_vehicle_id: undefined,
    target_created_by: access.user?.id ?? undefined,
    target_currency: bundle.currency,
  });
  if (quoteError || !quoteId) {
    if (quoteError) console.error("createQuoteFromBundle (create draft) failed", quoteError);
    return { error: "Could not create the quotation." };
  }

  const months = bundle.billingCycle === "annual" ? 12 : bundle.billingCycle === "quarterly" ? 3 : 1;
  const { error: itemError } = await supabase.from("quotation_items").insert({
    business_id: access.business.id,
    quotation_id: quoteId,
    kind: "service",
    name: bundle.name,
    description: bundle.description ?? null,
    quantity: months,
    unit_price: bundle.price,
    discount_amount: 0,
    tax_rate: 0,
    total: bundle.price * months,
  });
  if (itemError) {
    console.error("createQuoteFromBundle (insert item) failed", itemError);
    return { error: "Could not create the quotation." };
  }

  const { data: items } = await supabase
    .from("quotation_items")
    .select("quantity, unit_price, discount_amount, tax_rate")
    .eq("quotation_id", quoteId);
  const totals = computeTotals((items ?? []) as Parameters<typeof computeTotals>[0]);

  const { error: updateError } = await supabase
    .from("quotations")
    .update({
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      tax_total: totals.tax_total,
      total: totals.total,
      customer_notes: `Membership bundle: ${bundle.name} (${bundle.billingCycle}).`,
    })
    .eq("id", quoteId);
  if (updateError) {
    console.error("createQuoteFromBundle (update totals) failed", updateError);
    return { error: "Could not create the quotation." };
  }

  const { data: quoteRow } = await supabase
    .from("quotations")
    .select("quote_number")
    .eq("id", quoteId)
    .maybeSingle();

  revalidatePath(`/quotations/${quoteId}`);
  revalidatePath("/quotations");
  return {
    message: "Quote created from bundle.",
    result: { quoteId, quoteNumber: quoteRow?.quote_number ?? "" },
  };
}

/**
 * Portal customer expresses interest in a published bundle. Customers cannot
 * create quotations (staff-only RLS), so this records intent and routes them to
 * the workshop; the owner issues the quote from the dashboard.
 */
export async function selectBundle(
  _prev: FormState<{ bundleId: string }>,
  formData: FormData,
): Promise<FormState<{ bundleId: string }>> {
  const { accounts } = await requireCustomerPortal();
  if (accounts.length === 0) {
    return { error: "You need a linked customer portal account to select a plan." };
  }

  const bundleId = str(formData, "bundleId");
  if (!bundleId) return { error: "Select a plan." };

  const supabase = await createClient();
  // RLS guarantees the caller only sees published bundles for their business.
  const { data, error } = await supabase
    .from("membership_bundles")
    .select("id, name, business_id, is_published")
    .eq("id", bundleId)
    .maybeSingle();
  if (error || !data || !data.is_published) {
    return { error: "That plan is not available." };
  }

  await trackRetainerEvent("membership_bundle_selected", {
    business_id: data.business_id,
    role: "customer",
  });

  return {
    message: "Your interest has been registered. The workshop will prepare your quote.",
    result: { bundleId },
  };
}
