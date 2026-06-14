"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getUser, requireMembership } from "@/lib/auth";
import { canManageQuotes } from "@/lib/permissions";
import { computeLine, computeTotals } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type {
  ItemKind,
  ProductCategory,
  QuotationItem,
} from "@/lib/database.types";

export type FormState = { error?: string; message?: string };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
function optional(formData: FormData, key: string): string | undefined {
  const value = str(formData, key);
  return value === "" ? undefined : value;
}
function num(formData: FormData, key: string, fallback = 0): number {
  const raw = str(formData, key);
  if (raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Recompute and persist quotation totals from its line items. */
async function recomputeTotals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quotationId: string,
) {
  const { data: items } = await supabase
    .from("quotation_items")
    .select("quantity, unit_price, discount_amount, tax_rate")
    .eq("quotation_id", quotationId);

  const totals = computeTotals(
    (items ?? []) as Pick<
      QuotationItem,
      "quantity" | "unit_price" | "discount_amount" | "tax_rate"
    >[],
  );
  await supabase.from("quotations").update(totals).eq("id", quotationId);
}

export async function createQuote(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageQuotes(member.role))
    return { error: "You don't have permission to create quotations." };

  const customerId = str(formData, "customer_id");
  if (!customerId) return { error: "Select a customer." };

  const user = await getUser();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_quotation_draft", {
    target_business_id: business.id,
    target_customer_id: customerId,
    target_vehicle_id: optional(formData, "vehicle_id"),
    target_created_by: user?.id ?? undefined,
    target_currency: "AED",
  });
  if (error || !data) {
    return { error: error?.message ?? "Could not create the quotation." };
  }

  redirect(`/quotations/${data}`);
}

export async function addItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageQuotes(member.role))
    return { error: "You don't have permission to edit this quotation." };

  const quotationId = str(formData, "quotation_id");
  const name = str(formData, "name");
  if (!quotationId) return { error: "Missing quotation id." };
  if (!name) return { error: "Item name is required." };

  const kind = str(formData, "kind") as ItemKind;
  const quantity = num(formData, "quantity", 1);
  const unitPrice = num(formData, "unit_price", 0);
  const discount = num(formData, "discount_amount", 0);
  const taxRate = num(formData, "tax_rate", 0);
  const { total } = computeLine(quantity, unitPrice, discount, taxRate);

  const productCategory = optional(
    formData,
    "product_category",
  ) as ProductCategory | null;

  const supabase = await createClient();
  const { error } = await supabase.from("quotation_items").insert({
    business_id: business.id,
    quotation_id: quotationId,
    kind,
    product_category:
      kind === "product" || kind === "part" ? productCategory : null,
    name,
    description: optional(formData, "description"),
    quantity,
    unit_price: unitPrice,
    discount_amount: discount,
    tax_rate: taxRate,
    total,
    transparency: {
      brand: optional(formData, "brand"),
      warranty: optional(formData, "warranty"),
      origin: optional(formData, "origin"),
      supplier: optional(formData, "supplier"),
      expected_lifespan: optional(formData, "expected_lifespan"),
    },
  });
  if (error) return { error: error.message };

  await recomputeTotals(supabase, quotationId);
  revalidatePath(`/quotations/${quotationId}`);
  return { message: "Item added." };
}

export async function removeItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member } = await requireMembership();
  if (!canManageQuotes(member.role))
    return { error: "You don't have permission to edit this quotation." };

  const itemId = str(formData, "item_id");
  const quotationId = str(formData, "quotation_id");
  if (!itemId || !quotationId) return { error: "Missing item id." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("quotation_items")
    .delete()
    .eq("id", itemId);
  if (error) return { error: error.message };

  await recomputeTotals(supabase, quotationId);
  revalidatePath(`/quotations/${quotationId}`);
  return { message: "Item removed." };
}

export async function updateQuoteDetails(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member } = await requireMembership();
  if (!canManageQuotes(member.role))
    return { error: "You don't have permission to edit this quotation." };

  const id = str(formData, "id");
  if (!id) return { error: "Missing quotation id." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("quotations")
    .update({
      expected_completion_date: optional(formData, "expected_completion_date"),
      warranty_terms: optional(formData, "warranty_terms"),
      customer_notes: optional(formData, "customer_notes"),
      internal_notes: optional(formData, "internal_notes"),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/quotations/${id}`);
  return { message: "Quotation updated." };
}

export async function sendQuote(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member } = await requireMembership();
  if (!canManageQuotes(member.role))
    return { error: "You don't have permission to send this quotation." };

  const id = str(formData, "id");
  if (!id) return { error: "Missing quotation id." };

  const now = new Date();
  const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const supabase = await createClient();
  const { error } = await supabase
    .from("quotations")
    .update({
      status: "sent",
      sent_at: now.toISOString(),
      expires_at: expires.toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft");
  if (error) return { error: error.message };

  revalidatePath(`/quotations/${id}`);
  revalidatePath("/quotations");
  return { message: "Quotation sent to the customer." };
}

/**
 * Records a customer's digital approval of the current quote version. Allowed
 * by RLS only when the signed-in user IS the linked customer
 * (customers.app_user_id = auth.uid()), per `approvals_customer_insert`.
 */
export async function approveQuote(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getUser();
  if (!user) return { error: "You must be signed in to approve." };

  const quotationId = str(formData, "quotation_id");
  const businessId = str(formData, "business_id");
  const customerId = str(formData, "customer_id");
  const version = num(formData, "quotation_version", 1);
  const language = str(formData, "language") || "en";
  const customerNote = optional(formData, "customer_note");
  if (!quotationId || !businessId || !customerId)
    return { error: "Missing quotation details." };
  if (formData.get("acknowledge") !== "on")
    return { error: "Please acknowledge the parts, pricing, and terms." };

  const signature = str(formData, "signature");
  if (!signature) return { error: "Please type your full name to sign." };

  const headerList = await headers();
  const supabase = await createClient();
  const { error } = await supabase.from("approvals").insert({
    business_id: businessId,
    quotation_id: quotationId,
    customer_id: customerId,
    quotation_version: version,
    language,
    acknowledgement_text: `I, ${signature}, acknowledge the parts, pricing, and terms of this quotation.`,
    user_agent: headerList.get("user-agent"),
    device_data: { signed_name: signature, customer_note: customerNote },
  });
  if (error) return { error: error.message };

  revalidatePath(`/quotations/${quotationId}`);
  return { message: "Quotation approved. Thank you." };
}
