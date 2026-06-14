import "server-only";

import crypto from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  BillingInvoice,
  BillingPlan,
  BillingPlanFeature,
  SubscriptionStatus,
  Json,
} from "@/lib/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

type StripeCustomerLike = string | { id?: string | null; metadata?: StripeMetadata; email?: string | null };
type StripeMetadata = Record<string, string | undefined> | null | undefined;

type StripePriceLike = {
  id: string;
  currency?: string | null;
  unit_amount?: number | null;
  recurring?: { interval?: string | null } | null;
  product?: string | { id?: string | null; name?: string | null } | null;
  nickname?: string | null;
  metadata?: StripeMetadata;
};

type StripeSubscriptionItemLike = {
  id?: string | null;
  quantity?: number | null;
  price?: StripePriceLike | null;
  metadata?: StripeMetadata;
};

type StripeSubscriptionLike = {
  id: string;
  status: string;
  customer?: StripeCustomerLike;
  metadata?: StripeMetadata;
  cancel_at_period_end?: boolean | null;
  current_period_start?: number | null;
  current_period_end?: number | null;
  items?: { data?: StripeSubscriptionItemLike[] } | StripeSubscriptionItemLike[];
};

type StripeInvoiceLineLike = {
  id?: string | null;
  description?: string | null;
  quantity?: number | null;
  amount?: number | null;
  currency?: string | null;
  metadata?: StripeMetadata;
  period?: { start?: number | null; end?: number | null } | null;
};

type StripeInvoiceLike = {
  id: string;
  customer?: StripeCustomerLike;
  subscription?: string | StripeSubscriptionLike | null;
  payment_intent?: string | { id?: string | null } | null;
  metadata?: StripeMetadata;
  status?: string | null;
  currency?: string | null;
  subtotal?: number | null;
  tax?: number | null;
  total?: number | null;
  amount_paid?: number | null;
  amount_due?: number | null;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  number?: string | null;
  created?: number | null;
  due_date?: number | null;
  status_transitions?: {
    paid_at?: number | null;
    voided_at?: number | null;
  } | null;
  lines?: { data?: StripeInvoiceLineLike[] } | StripeInvoiceLineLike[];
};

type StripePaymentLike = {
  id: string;
  amount?: number | null;
  amount_received?: number | null;
  currency?: string | null;
  customer?: StripeCustomerLike;
  invoice?: string | null;
  status?: string | null;
  metadata?: StripeMetadata;
  created?: number | null;
  latest_charge?: string | { id?: string | null } | null;
  payment_intent?: string | { id?: string | null } | null;
};

type StripeChargeLike = {
  id: string;
  amount?: number | null;
  amount_received?: number | null;
  amount_captured?: number | null;
  currency?: string | null;
  customer?: StripeCustomerLike;
  invoice?: string | null;
  status?: string | null;
  metadata?: StripeMetadata;
  created?: number | null;
  payment_intent?: string | { id?: string | null } | null;
};

type StripeEventLike = {
  id: string;
  type: string;
  data: {
    object: StripeInvoiceLike | StripeSubscriptionLike | StripePaymentLike | StripeChargeLike;
  };
};

type BillingPlanWithFeatures = BillingPlan & { features: BillingPlanFeature[] };

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function getObjectId(value: StripeCustomerLike | string | null | undefined) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return asString(value.id);
}

function getObjectIdAny(value: { id?: string | null } | string | null | undefined) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return asString(value.id);
}

function toIso(value: number | null | undefined) {
  if (typeof value !== "number") return null;
  return new Date(value * 1000).toISOString();
}

function upperCurrency(value: string | null | undefined) {
  return (value ?? "AED").toUpperCase();
}

function extractProductKey(price: StripePriceLike | null | undefined) {
  if (!price) return "Stripe item";
  if (typeof price.product === "object" && price.product) {
    if (price.product.name) return price.product.name;
    if (price.product.id) return price.product.id;
  }
  if (price.nickname) return price.nickname;
  return price.id;
}

function mapSubscriptionStatus(status: string | null | undefined): SubscriptionStatus {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "trialing") return "trialing";
  if (normalized === "active") return "active";
  if (normalized === "past_due") return "past_due";
  if (normalized === "canceled" || normalized === "cancelled") return "canceled";
  if (normalized === "unpaid") return "unpaid";
  return "incomplete";
}

async function loadActiveBillingPlans(admin: AdminClient) {
  const [{ data: plans }, { data: features }] = await Promise.all([
    admin
      .from("billing_plans")
      .select(
        "id, slug, name, description, stripe_price_id_monthly, stripe_price_id_yearly, monthly_amount, yearly_amount, currency, is_active, sort_order, metadata, created_at, updated_at",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    admin
      .from("billing_plan_features")
      .select(
        "id, plan_id, feature_key, feature_name, description, included, limit_value, limit_unit, sort_order, created_at",
      )
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const featureMap = new Map<string, BillingPlanFeature[]>();
  (features ?? []).forEach((feature) => {
    const list = featureMap.get(feature.plan_id) ?? [];
    list.push(feature);
    featureMap.set(feature.plan_id, list);
  });

  return ((plans ?? []) as BillingPlan[]).map((plan) => ({
    ...plan,
    features: featureMap.get(plan.id) ?? [],
  })) as BillingPlanWithFeatures[];
}

async function resolveBusinessByStripeCustomer(admin: AdminClient, customerId: string | null | undefined) {
  const id = asString(customerId);
  if (!id) return null;
  const { data } = await admin.from("businesses").select("id").eq("stripe_customer_id", id).maybeSingle();
  return data?.id ?? null;
}

async function resolveBusinessBySubscription(admin: AdminClient, stripeSubscriptionId: string | null | undefined) {
  const id = asString(stripeSubscriptionId);
  if (!id) return null;
  const { data } = await admin
    .from("subscriptions")
    .select("business_id")
    .eq("stripe_subscription_id", id)
    .maybeSingle();
  return data?.business_id ?? null;
}

async function resolveBusinessByInvoice(admin: AdminClient, stripeInvoiceId: string | null | undefined) {
  const id = asString(stripeInvoiceId);
  if (!id) return null;
  const { data } = await admin
    .from("billing_invoices")
    .select("business_id")
    .eq("stripe_invoice_id", id)
    .maybeSingle();
  return data?.business_id ?? null;
}

async function resolveSubscriptionRecord(admin: AdminClient, stripeSubscriptionId: string | null | undefined) {
  const id = asString(stripeSubscriptionId);
  if (!id) return null;
  const { data } = await admin
    .from("subscriptions")
    .select("id, business_id, stripe_subscription_id, plan_key, status, entitlements")
    .eq("stripe_subscription_id", id)
    .maybeSingle();
  return data ?? null;
}

async function resolveBusinessByMetadata(admin: AdminClient, metadata: StripeMetadata) {
  const candidate = asString(metadata?.business_id) ?? asString(metadata?.tenant_id) ?? asString(metadata?.workspace_id);
  if (!candidate || !isUuid(candidate)) return null;
  const { data } = await admin.from("businesses").select("id").eq("id", candidate).maybeSingle();
  return data?.id ?? null;
}

async function resolveBusinessForInvoice(admin: AdminClient, invoice: StripeInvoiceLike) {
  return (
    (await resolveBusinessByMetadata(admin, invoice.metadata)) ??
    (await resolveBusinessBySubscription(
      admin,
      typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id,
    )) ??
    (await resolveBusinessByStripeCustomer(admin, getObjectId(invoice.customer)))
  );
}

async function resolveBusinessForSubscription(admin: AdminClient, subscription: StripeSubscriptionLike) {
  return (
    (await resolveBusinessByMetadata(admin, subscription.metadata)) ??
    (await resolveBusinessByStripeCustomer(admin, getObjectId(subscription.customer))) ??
    (await resolveBusinessBySubscription(admin, subscription.id))
  );
}

async function resolveBusinessForPaymentLike(
  admin: AdminClient,
  payment: StripePaymentLike | StripeChargeLike,
) {
  return (
    (await resolveBusinessByMetadata(admin, payment.metadata)) ??
    (await resolveBusinessByInvoice(admin, payment.invoice)) ??
    (await resolveBusinessByStripeCustomer(admin, getObjectId(payment.customer)))
  );
}

async function resolvePlanFromSubscription(admin: AdminClient, subscription: StripeSubscriptionLike) {
  const plans = await loadActiveBillingPlans(admin);
  const itemRows = Array.isArray(subscription.items)
    ? subscription.items
    : subscription.items?.data ?? [];
  const priceIds = new Set(
    itemRows.flatMap((item) => [item.price?.id].filter((value): value is string => !!value)),
  );

  const plan = plans.find((candidate) => {
    return (
      (candidate.stripe_price_id_monthly && priceIds.has(candidate.stripe_price_id_monthly)) ||
      (candidate.stripe_price_id_yearly && priceIds.has(candidate.stripe_price_id_yearly))
    );
  });

  const fallbackPlanKey =
    asString(subscription.metadata?.plan_key) ??
    plan?.slug ??
    "unknown";

  const entitlements = Object.fromEntries(
    (plan?.features ?? []).map((feature) => [
      feature.feature_key,
      {
        included: feature.included,
        limit_value: feature.limit_value,
        limit_unit: feature.limit_unit,
      },
    ]),
  );

  const billingInterval =
    plan?.stripe_price_id_monthly && priceIds.has(plan.stripe_price_id_monthly)
      ? "monthly"
      : plan?.stripe_price_id_yearly && priceIds.has(plan.stripe_price_id_yearly)
        ? "yearly"
        : "unknown";

  const firstPrice = itemRows.find((item) => item.price?.id)?.price ?? null;

  return {
    planKey: fallbackPlanKey,
    entitlements,
    billingInterval,
    subscriptionItems: itemRows.map((item) => ({
      stripe_subscription_item_id: asString(item.id),
      stripe_price_id: asString(item.price?.id) ?? "unknown",
      product_key: extractProductKey(item.price ?? null),
      quantity: Number(item.quantity ?? 1),
    })),
    currency: upperCurrency(firstPrice?.currency ?? null),
  };
}

async function upsertInvoiceItems(
  admin: AdminClient,
  invoiceId: string,
  businessId: string,
  lines: StripeInvoiceLineLike[],
) {
  if (!lines.length) return;

  const normalized = lines
    .map((line, index) => {
      const lineId = asString(line.id) ?? `${invoiceId}:${index}`;
      return {
        stripe_invoice_line_item_id: lineId,
        invoice_id: invoiceId,
        business_id: businessId,
        description: line.description ?? "Stripe invoice item",
        quantity: Math.max(Number(line.quantity ?? 1), 1),
        unit_amount: Math.max(
          Math.round(Number(line.amount ?? 0) / Math.max(Number(line.quantity ?? 1), 1)),
          0,
        ),
        amount: Math.max(Number(line.amount ?? 0), 0),
        currency: upperCurrency(line.currency),
        period_start: toIso(line.period?.start ?? null),
        period_end: toIso(line.period?.end ?? null),
        metadata: line.metadata ?? {},
      };
    });

  await admin.from("billing_invoice_items").delete().eq("invoice_id", invoiceId);
  await admin
    .from("billing_invoice_items")
    .upsert(normalized, { onConflict: "stripe_invoice_line_item_id" });
}

async function upsertSubscriptionItems(
  admin: AdminClient,
  subscriptionRowId: string,
  items: StripeSubscriptionItemLike[],
) {
  if (!items.length) return;

  const normalized = items.map((item, index) => ({
    stripe_subscription_item_id: asString(item.id) ?? `${subscriptionRowId}:${index}`,
    subscription_id: subscriptionRowId,
    stripe_price_id: asString(item.price?.id) ?? "unknown",
    product_key: extractProductKey(item.price ?? null),
    quantity: Math.max(Number(item.quantity ?? 1), 1),
  }));

  await admin.from("subscription_items").delete().eq("subscription_id", subscriptionRowId);
  await admin
    .from("subscription_items")
    .upsert(normalized, { onConflict: "stripe_subscription_item_id" });
}

async function syncInvoiceRow(admin: AdminClient, invoice: StripeInvoiceLike) {
  const businessId = await resolveBusinessForInvoice(admin, invoice);
  if (!businessId) {
    console.warn(`[stripe:webhook] skipped invoice ${invoice.id} because business could not be resolved`);
    return { processed: false as const, reason: "unresolved_business" };
  }

  const subscriptionStripeId =
    typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id ?? null;
  const subscriptionRow = await resolveSubscriptionRecord(admin, subscriptionStripeId);

  const payload = {
    business_id: businessId,
    subscription_id: subscriptionRow?.id ?? null,
    stripe_invoice_id: invoice.id,
    stripe_customer_id: getObjectId(invoice.customer),
    stripe_subscription_id: subscriptionStripeId,
    invoice_number: invoice.number ?? null,
    status: (invoice.status ?? "draft") as BillingInvoice["status"],
    currency: upperCurrency(invoice.currency),
    subtotal_amount: Math.max(Number(invoice.subtotal ?? 0), 0),
    tax_amount: Math.max(Number(invoice.tax ?? 0), 0),
    total_amount: Math.max(Number(invoice.total ?? 0), 0),
    amount_paid: Math.max(Number(invoice.amount_paid ?? 0), 0),
    amount_due: Math.max(Number(invoice.amount_due ?? 0), 0),
    hosted_invoice_url: invoice.hosted_invoice_url ?? null,
    invoice_pdf_url: invoice.invoice_pdf ?? null,
    period_start: toIso(invoice.created ?? null),
    period_end: null,
    due_date: toIso(invoice.due_date ?? null),
    paid_at: toIso(invoice.status_transitions?.paid_at ?? null),
    voided_at: toIso(invoice.status_transitions?.voided_at ?? null),
    updated_at: new Date().toISOString(),
  };

  const { data: upserted, error } = await admin
    .from("billing_invoices")
    .upsert(payload, { onConflict: "stripe_invoice_id" })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  const invoiceRowId = upserted?.id;
  const lineItems = Array.isArray(invoice.lines)
    ? invoice.lines
    : invoice.lines?.data ?? [];
  if (invoiceRowId && lineItems.length > 0) {
    await upsertInvoiceItems(admin, invoiceRowId, businessId, lineItems);
  }

  return { processed: true as const, businessId, invoiceRowId };
}

async function syncSubscriptionRow(admin: AdminClient, subscription: StripeSubscriptionLike) {
  const businessId = await resolveBusinessForSubscription(admin, subscription);
  if (!businessId) {
    console.warn(`[stripe:webhook] skipped subscription ${subscription.id} because business could not be resolved`);
    return { processed: false as const, reason: "unresolved_business" };
  }

  const planSync = await resolvePlanFromSubscription(admin, subscription);
  const currentPeriodStart = toIso(subscription.current_period_start ?? null);
  const currentPeriodEnd = toIso(subscription.current_period_end ?? null);
  const status = mapSubscriptionStatus(subscription.status);
  const subscriptionRowPayload = {
    business_id: businessId,
    stripe_subscription_id: subscription.id,
    status,
    plan_key: planSync.planKey,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: !!subscription.cancel_at_period_end,
    entitlements: planSync.entitlements,
    updated_at: new Date().toISOString(),
  };

  const { data: upserted, error } = await admin
    .from("subscriptions")
    .upsert(subscriptionRowPayload, { onConflict: "stripe_subscription_id" })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  const subscriptionRowId = upserted?.id;
  const items = Array.isArray(subscription.items) ? subscription.items : subscription.items?.data ?? [];
  if (subscriptionRowId && items.length > 0) {
    await upsertSubscriptionItems(admin, subscriptionRowId, items);
  }

  if (subscription.id) {
    await admin
      .from("billing_invoices")
      .update({ subscription_id: subscriptionRowId })
      .eq("business_id", businessId)
      .eq("stripe_subscription_id", subscription.id)
      .is("subscription_id", null);
  }

  return { processed: true as const, businessId, subscriptionRowId };
}

async function syncPaymentEvent(
  admin: AdminClient,
  event: StripeEventLike,
  payment: StripePaymentLike | StripeChargeLike,
  paymentStatus: string,
  options?: {
    invoiceId?: string | null;
    stripeChargeId?: string | null;
    stripePaymentIntentId?: string | null;
  },
) {
  const businessId = await resolveBusinessForPaymentLike(admin, payment);
  if (!businessId) {
    console.warn(`[stripe:webhook] skipped payment event ${event.id} because business could not be resolved`);
    return { processed: false as const, reason: "unresolved_business" };
  }

  const invoiceStripeId = asString(payment.invoice);
  const subscriptionRow = invoiceStripeId
    ? await (async () => {
        const { data } = await admin
          .from("billing_invoices")
          .select("id, subscription_id, stripe_subscription_id")
          .eq("stripe_invoice_id", invoiceStripeId)
          .maybeSingle();
        return data ?? null;
      })()
    : null;

  const payload = {
    business_id: businessId,
    invoice_id: options?.invoiceId ?? subscriptionRow?.id ?? null,
    subscription_id: subscriptionRow?.subscription_id ?? null,
    stripe_payment_intent_id:
      options?.stripePaymentIntentId ??
      ("latest_charge" in payment
        ? getObjectIdAny((payment as StripePaymentLike).latest_charge)
        : getObjectIdAny((payment as StripeChargeLike).payment_intent)),
    stripe_charge_id:
      options?.stripeChargeId ??
      ("latest_charge" in payment ? getObjectIdAny((payment as StripePaymentLike).latest_charge) : asString(payment.id)),
    event_type: event.type,
    status: paymentStatus,
    amount: Math.max(
      Number(
        payment.amount_received ??
          ("amount_captured" in payment ? payment.amount_captured : null) ??
          payment.amount ??
          0,
      ),
      0,
    ),
    currency: upperCurrency(payment.currency),
    provider: "stripe",
    provider_event_id: event.id,
    raw_payload: JSON.parse(JSON.stringify(event)) as Json,
    occurred_at: toIso(payment.created ?? null) ?? new Date().toISOString(),
  };

  const { error } = await admin
    .from("billing_payment_events")
    .upsert(payload, { onConflict: "provider_event_id" });

  if (error) {
    throw error;
  }

  return { processed: true as const, businessId };
}

function eventObject(event: StripeEventLike) {
  return event.data.object;
}

export async function processStripeWebhookEvent(event: StripeEventLike) {
  const admin = createAdminClient();
  const object = eventObject(event);

  switch (event.type) {
    case "invoice.created":
    case "invoice.finalized":
    case "invoice.updated":
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.voided": {
      const invoice = object as StripeInvoiceLike;
      const result = await syncInvoiceRow(admin, invoice);
      if (result.processed && event.type === "invoice.paid") {
        await syncPaymentEvent(
          admin,
          event,
          {
            id: invoice.id,
            amount: invoice.amount_paid ?? invoice.total ?? 0,
            amount_received: invoice.amount_paid ?? invoice.total ?? 0,
            currency: invoice.currency ?? "aed",
            customer: invoice.customer ?? undefined,
            invoice: invoice.id,
            payment_intent: getObjectIdAny(invoice.payment_intent),
            status: "succeeded",
            metadata: invoice.metadata,
            created: invoice.status_transitions?.paid_at ?? invoice.created ?? null,
          },
          "succeeded",
          {
            invoiceId: result.invoiceRowId,
            stripePaymentIntentId: getObjectIdAny(invoice.payment_intent),
            stripeChargeId: null,
          },
        );
      }
      if (result.processed && event.type === "invoice.payment_failed") {
        await syncPaymentEvent(
          admin,
          event,
          {
            id: invoice.id,
            amount: invoice.amount_due ?? invoice.total ?? 0,
            amount_received: 0,
            currency: invoice.currency ?? "aed",
            customer: invoice.customer ?? undefined,
            invoice: invoice.id,
            payment_intent: getObjectIdAny(invoice.payment_intent),
            status: "failed",
            metadata: invoice.metadata,
            created: invoice.created ?? null,
          },
          "failed",
          {
            invoiceId: result.invoiceRowId,
            stripePaymentIntentId: getObjectIdAny(invoice.payment_intent),
            stripeChargeId: null,
          },
        );
      }
      return result;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return syncSubscriptionRow(admin, object as StripeSubscriptionLike);
    case "payment_intent.succeeded":
      return syncPaymentEvent(admin, event, object as StripePaymentLike, "succeeded");
    case "payment_intent.payment_failed":
      return syncPaymentEvent(admin, event, object as StripePaymentLike, "failed");
    case "charge.succeeded":
      return syncPaymentEvent(admin, event, object as StripeChargeLike, "succeeded");
    case "charge.failed":
      return syncPaymentEvent(admin, event, object as StripeChargeLike, "failed");
    default:
      return { processed: false as const, ignored: true as const };
  }
}

export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string | null | undefined,
  toleranceSeconds = 300,
) {
  if (!signatureHeader || !secret) {
    return { ok: false as const, reason: "missing_signature_or_secret" };
  }

  const parts = Object.fromEntries(
    signatureHeader
      .split(",")
      .map((part) => part.trim().split("=", 2))
      .filter((parts): parts is [string, string] => parts.length === 2),
  );

  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp)) {
    return { ok: false as const, reason: "invalid_timestamp" };
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > toleranceSeconds) {
    return { ok: false as const, reason: "timestamp_out_of_tolerance" };
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  const candidates = (signatureHeader.match(/v1=([0-9a-f]+)/g) ?? []).map((entry) =>
    entry.slice(3),
  );
  const expectedBuffer = Buffer.from(expected, "hex");
  for (const candidate of candidates) {
    const candidateBuffer = Buffer.from(candidate, "hex");
    if (
      candidateBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(candidateBuffer, expectedBuffer)
    ) {
      return { ok: true as const };
    }
  }

  return { ok: false as const, reason: "signature_mismatch" };
}
