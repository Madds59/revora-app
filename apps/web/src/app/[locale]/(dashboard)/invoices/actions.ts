"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireMembership } from "@/lib/auth";
import { canManageInvoices } from "@/lib/permissions";
import { computeLine, computeTotals } from "@/lib/money";
import { enqueueInvoiceIssuedNotification } from "@/lib/notifications/service";
import { createClient } from "@/lib/supabase/server";
import { firstValidationMessage } from "@/lib/validation/common";
import {
  addInvoiceItemSchema,
  createInvoiceCreditNoteSchema,
  createInvoiceFromJobSchema,
  issueInvoiceSchema,
  recordInvoicePaymentSchema,
  removeInvoiceItemSchema,
  voidInvoiceSchema,
} from "@/lib/validation/invoices";
import type { InvoiceItem, ItemKind, ProductCategory } from "@/lib/database.types";

export type FormState = { error?: string; message?: string };

// Non-enumerating response for missing OR out-of-tenant invoices (APPSEC-11
// convention, see (portal)/portal/actions.ts).
const INVOICE_UNAVAILABLE = "Invoice not found or unavailable.";

/** Recompute and persist invoice totals from its line items -- mirrors
 * recomputeTotals in quotations/actions.ts. */
async function recomputeInvoiceTotals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
) {
  const { data: items } = await supabase
    .from("invoice_items")
    .select("quantity, unit_price, discount_amount, tax_rate")
    .eq("invoice_id", invoiceId);

  const totals = computeTotals(
    (items ?? []) as Pick<
      InvoiceItem,
      "quantity" | "unit_price" | "discount_amount" | "tax_rate"
    >[],
  );
  await supabase.from("invoices").update(totals).eq("id", invoiceId);
}

/** Create a draft invoice for a job, seeding items from the job's approved
 * quote so staff aren't retyping a job that already has priced line items. */
export async function createInvoiceFromJob(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageInvoices(member.role))
    return { error: "You don't have permission to create invoices." };

  const parsed = createInvoiceFromJobSchema.safeParse({
    jobId: formData.get("job_id"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { jobId } = parsed.data;

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, business_id, branch_id, customer_id, quotation_id")
    .eq("business_id", business.id)
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { error: "Job not found." };

  const { data: existing } = await supabase
    .from("invoices")
    .select("id")
    .eq("job_id", jobId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (existing) redirect(`/invoices/${existing.id}`);

  let vehicleId: string | null = null;
  const quoteItems: Array<{
    description: string | null;
    discount_amount: number;
    kind: ItemKind;
    name: string;
    product_category: ProductCategory | null;
    product_id: string | null;
    quantity: number;
    tax_rate: number;
    total: number;
    unit_price: number;
    position: number;
  }> = [];

  if (job.quotation_id) {
    const [{ data: quote }, { data: items }] = await Promise.all([
      supabase
        .from("quotations")
        .select("vehicle_id")
        .eq("id", job.quotation_id)
        .maybeSingle(),
      supabase
        .from("quotation_items")
        .select(
          "description, discount_amount, kind, name, product_category, product_id, quantity, tax_rate, total, unit_price, position",
        )
        .eq("quotation_id", job.quotation_id)
        .order("position", { ascending: true }),
    ]);
    vehicleId = quote?.vehicle_id ?? null;
    quoteItems.push(
      ...((items ?? []) as unknown as typeof quoteItems),
    );
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      business_id: business.id,
      branch_id: job.branch_id,
      job_id: job.id,
      quotation_id: job.quotation_id,
      customer_id: job.customer_id,
      vehicle_id: vehicleId,
    })
    .select("id")
    .single();
  if (invoiceError || !invoice) {
    console.error("createInvoiceFromJob failed", invoiceError);
    return { error: "Could not create the invoice." };
  }

  if (quoteItems.length > 0) {
    const { error: itemsError } = await supabase.from("invoice_items").insert(
      quoteItems.map((item) => ({
        business_id: business.id,
        invoice_id: invoice.id,
        product_id: item.product_id,
        kind: item.kind,
        product_category: item.product_category,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        discount_amount: item.discount_amount,
        total: item.total,
        position: item.position,
      })),
    );
    if (itemsError) console.error("createInvoiceFromJob item copy failed", itemsError);
    await recomputeInvoiceTotals(supabase, invoice.id);
  }

  redirect(`/invoices/${invoice.id}`);
}

export async function addInvoiceItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageInvoices(member.role))
    return { error: "You don't have permission to edit this invoice." };

  const parsed = addInvoiceItemSchema.safeParse({
    invoiceId: formData.get("invoice_id"),
    kind: formData.get("kind"),
    productCategory: formData.get("product_category"),
    name: formData.get("name"),
    description: formData.get("description"),
    quantity: formData.get("quantity"),
    unitPrice: formData.get("unit_price"),
    taxRate: formData.get("tax_rate"),
    discountAmount: formData.get("discount_amount"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const { data: invoice } = await createClientAndCheckDraft(business.id, v.invoiceId);
  if (!invoice) return { error: "Only draft invoices can be edited." };

  const { total } = computeLine(v.quantity, v.unitPrice, v.discountAmount, v.taxRate);

  const productCategory =
    v.kind === "product" || v.kind === "part"
      ? ((v.productCategory ?? null) as ProductCategory | null)
      : null;

  const supabase = await createClient();
  const { error } = await supabase.from("invoice_items").insert({
    business_id: business.id,
    invoice_id: v.invoiceId,
    kind: v.kind,
    product_category: productCategory,
    name: v.name,
    description: v.description ?? null,
    quantity: v.quantity,
    unit_price: v.unitPrice,
    discount_amount: v.discountAmount,
    tax_rate: v.taxRate,
    total,
  });
  if (error) {
    console.error("addInvoiceItem failed", error);
    return { error: "Could not add the item." };
  }

  await recomputeInvoiceTotals(supabase, v.invoiceId);
  revalidatePath(`/invoices/${v.invoiceId}`);
  return { message: "Item added." };
}

export async function removeInvoiceItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageInvoices(member.role))
    return { error: "You don't have permission to edit this invoice." };

  const parsed = removeInvoiceItemSchema.safeParse({
    id: formData.get("id"),
    invoiceId: formData.get("invoice_id"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { id, invoiceId } = parsed.data;

  const { data: invoice } = await createClientAndCheckDraft(business.id, invoiceId);
  if (!invoice) return { error: "Only draft invoices can be edited." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("invoice_items")
    .delete()
    .eq("id", id)
    .eq("invoice_id", invoiceId);
  if (error) {
    console.error("removeInvoiceItem failed", error);
    return { error: "Could not remove the item." };
  }

  await recomputeInvoiceTotals(supabase, invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
  return { message: "Item removed." };
}

/** Draft-only guard shared by addInvoiceItem/removeInvoiceItem -- issued
 * invoices are frozen documents and must not have their line items edited. */
async function createClientAndCheckDraft(businessId: string, invoiceId: string) {
  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("business_id", businessId)
    .eq("id", invoiceId)
    .maybeSingle();
  return { data: invoice && invoice.status === "draft" ? invoice : null };
}

export async function issueInvoice(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member } = await requireMembership();
  if (!canManageInvoices(member.role))
    return { error: "You don't have permission to issue invoices." };

  const parsed = issueInvoiceSchema.safeParse({
    invoiceId: formData.get("invoice_id"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { invoiceId } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_invoice", {
    target_invoice_id: invoiceId,
  });
  if (error) {
    console.error("issueInvoice failed", error);
    if (error.message?.includes("TRN")) {
      return { error: "Set the business TRN in Settings before issuing invoices." };
    }
    return { error: "Could not issue the invoice." };
  }

  await enqueueInvoiceIssuedNotification(invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { message: "Invoice issued." };
}

export async function recordInvoicePayment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageInvoices(member.role))
    return { error: "You don't have permission to record payments." };

  const parsed = recordInvoicePaymentSchema.safeParse({
    invoiceId: formData.get("invoice_id"),
    method: formData.get("method"),
    amount: formData.get("amount"),
    reference: formData.get("reference"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const supabase = await createClient();

  // APPSEC-17 defense in depth (RLS invoice_payments_staff_manage in 0035 is
  // the real gate): v.invoiceId is client-supplied and was previously written
  // straight into the insert, so a manager of one business could book a payment
  // against another tenant's invoice and the SECURITY DEFINER recompute trigger
  // would mark it paid. Resolve the invoice inside our own business first.
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("business_id", business.id)
    .eq("id", v.invoiceId)
    .maybeSingle();
  if (!invoice) return { error: INVOICE_UNAVAILABLE };
  if (invoice.status === "draft" || invoice.status === "void") {
    return { error: "Only an issued invoice can take a payment." };
  }

  const { error } = await supabase.from("invoice_payments").insert({
    business_id: business.id,
    invoice_id: v.invoiceId,
    method: v.method,
    amount: v.amount,
    reference: v.reference ?? null,
    notes: v.notes ?? null,
    recorded_by: member.user_id,
  });
  if (error) {
    console.error("recordInvoicePayment failed", error);
    return { error: "Could not record the payment." };
  }

  revalidatePath(`/invoices/${v.invoiceId}`);
  revalidatePath("/invoices");
  return { message: "Payment recorded." };
}

export async function voidInvoice(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member } = await requireMembership();
  if (!canManageInvoices(member.role))
    return { error: "You don't have permission to void invoices." };

  const parsed = voidInvoiceSchema.safeParse({
    invoiceId: formData.get("invoice_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { invoiceId, reason } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_invoice", {
    target_invoice_id: invoiceId,
    reason,
  });
  if (error) {
    console.error("voidInvoice failed", error);
    if (error.message?.includes("recorded payments")) {
      return { error: "This invoice has payments recorded -- issue a credit note instead of voiding it." };
    }
    return { error: "Could not void the invoice." };
  }

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { message: "Invoice voided." };
}

export async function createInvoiceCreditNote(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member } = await requireMembership();
  if (!canManageInvoices(member.role))
    return { error: "You don't have permission to issue credit notes." };

  const parsed = createInvoiceCreditNoteSchema.safeParse({
    invoiceId: formData.get("invoice_id"),
    amount: formData.get("amount"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { invoiceId, amount, reason } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_invoice_credit_note", {
    target_invoice_id: invoiceId,
    amount,
    reason,
  });
  if (error) {
    console.error("createInvoiceCreditNote failed", error);
    return { error: "Could not issue the credit note." };
  }

  revalidatePath(`/invoices/${invoiceId}`);
  return { message: "Credit note issued." };
}
