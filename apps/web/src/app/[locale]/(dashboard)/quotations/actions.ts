"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getUser, requireMembership } from "@/lib/auth";
import { canManageQuotes } from "@/lib/permissions";
import { computeLine, computeTotals } from "@/lib/money";
import { enqueueQuoteSentNotification } from "@/lib/notifications/service";
import { createClient } from "@/lib/supabase/server";
import { firstValidationMessage } from "@/lib/validation/common";
import {
  addItemSchema,
  approveQuoteSchema,
  createQuoteSchema,
  removeItemSchema,
  sendQuoteSchema,
  updateQuoteDetailsSchema,
} from "@/lib/validation/quotations";
import type {
  ProductCategory,
  QuotationItem,
} from "@/lib/database.types";

export type FormState = { error?: string; message?: string };

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

  const parsed = createQuoteSchema.safeParse({
    customerId: formData.get("customer_id"),
    vehicleId: formData.get("vehicle_id"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { customerId, vehicleId } = parsed.data;

  const user = await getUser();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_quotation_draft", {
    target_business_id: business.id,
    target_customer_id: customerId,
    target_vehicle_id: vehicleId ?? undefined,
    target_created_by: user?.id ?? undefined,
    target_currency: "AED",
  });
  if (error || !data) {
    if (error) console.error("createQuote failed", error);
    return { error: "Could not create the quotation." };
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

  const parsed = addItemSchema.safeParse({
    quotationId: formData.get("quotation_id"),
    name: formData.get("name"),
    kind: formData.get("kind"),
    productCategory: formData.get("product_category"),
    quantity: formData.get("quantity"),
    unitPrice: formData.get("unit_price"),
    discountAmount: formData.get("discount_amount"),
    taxRate: formData.get("tax_rate"),
    description: formData.get("description"),
    brand: formData.get("brand"),
    warranty: formData.get("warranty"),
    origin: formData.get("origin"),
    supplier: formData.get("supplier"),
    expectedLifespan: formData.get("expected_lifespan"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const { total } = computeLine(
    v.quantity,
    v.unitPrice,
    v.discountAmount,
    v.taxRate,
  );

  const productCategory =
    v.kind === "product" || v.kind === "part"
      ? ((v.productCategory ?? null) as ProductCategory | null)
      : null;

  const supabase = await createClient();
  const { error } = await supabase.from("quotation_items").insert({
    business_id: business.id,
    quotation_id: v.quotationId,
    kind: v.kind,
    product_category: productCategory,
    name: v.name,
    description: v.description ?? null,
    quantity: v.quantity,
    unit_price: v.unitPrice,
    discount_amount: v.discountAmount,
    tax_rate: v.taxRate,
    total,
    transparency: {
      brand: v.brand,
      warranty: v.warranty,
      origin: v.origin,
      supplier: v.supplier,
      expected_lifespan: v.expectedLifespan,
    },
  });
  if (error) {
    console.error("addItem failed", error);
    return { error: "Could not add item. Please try again." };
  }

  await recomputeTotals(supabase, v.quotationId);
  revalidatePath(`/quotations/${v.quotationId}`);
  return { message: "Item added." };
}

export async function removeItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member } = await requireMembership();
  if (!canManageQuotes(member.role))
    return { error: "You don't have permission to edit this quotation." };

  const parsed = removeItemSchema.safeParse({
    itemId: formData.get("item_id"),
    quotationId: formData.get("quotation_id"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { itemId, quotationId } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("quotation_items")
    .delete()
    .eq("id", itemId);
  if (error) {
    console.error("removeItem failed", error);
    return { error: "Could not remove item. Please try again." };
  }

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

  const parsed = updateQuoteDetailsSchema.safeParse({
    id: formData.get("id"),
    expectedCompletionDate: formData.get("expected_completion_date"),
    warrantyTerms: formData.get("warranty_terms"),
    customerNotes: formData.get("customer_notes"),
    internalNotes: formData.get("internal_notes"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("quotations")
    .update({
      expected_completion_date: v.expectedCompletionDate ?? null,
      warranty_terms: v.warrantyTerms ?? null,
      customer_notes: v.customerNotes ?? null,
      internal_notes: v.internalNotes ?? null,
    })
    .eq("id", v.id);
  if (error) {
    console.error("updateQuoteDetails failed", error);
    return { error: "Could not update quotation. Please try again." };
  }

  revalidatePath(`/quotations/${v.id}`);
  return { message: "Quotation updated." };
}

export async function sendQuote(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member } = await requireMembership();
  if (!canManageQuotes(member.role))
    return { error: "You don't have permission to send this quotation." };

  const parsed = sendQuoteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { id } = parsed.data;

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
  if (error) {
    console.error("sendQuote failed", error);
    return { error: "Could not send quotation. Please try again." };
  }

  await enqueueQuoteSentNotification(id);

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

  const parsed = approveQuoteSchema.safeParse({
    quotationId: formData.get("quotation_id"),
    businessId: formData.get("business_id"),
    customerId: formData.get("customer_id"),
    quotationVersion: formData.get("quotation_version"),
    language: formData.get("language"),
    signature: formData.get("signature"),
    customerNote: formData.get("customer_note"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  if (formData.get("acknowledge") !== "on")
    return { error: "Please acknowledge the parts, pricing, and terms." };

  const headerList = await headers();
  const supabase = await createClient();
  const { error } = await supabase.from("approvals").insert({
    business_id: v.businessId,
    quotation_id: v.quotationId,
    customer_id: v.customerId,
    quotation_version: v.quotationVersion,
    language: v.language,
    acknowledgement_text: `I, ${v.signature}, acknowledge the parts, pricing, and terms of this quotation.`,
    user_agent: headerList.get("user-agent"),
    device_data: { signed_name: v.signature, customer_note: v.customerNote },
  });
  if (error) {
    console.error("approveQuote failed", error);
    return { error: "Could not record approval. Please try again." };
  }

  revalidatePath(`/quotations/${v.quotationId}`);
  return { message: "Quotation approved. Thank you." };
}
