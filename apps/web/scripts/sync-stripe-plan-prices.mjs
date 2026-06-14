// Sync Stripe price IDs into the billing_plans catalog.
//
// Usage (from apps/web):
//   node scripts/sync-stripe-plan-prices.mjs
//
// Env:
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//   STRIPE_SECRET_KEY (optional, to backfill live amounts/currency)
//   STRIPE_PRICE_STARTER_MONTHLY
//   STRIPE_PRICE_STARTER_YEARLY
//   STRIPE_PRICE_PROFESSIONAL_MONTHLY
//   STRIPE_PRICE_PROFESSIONAL_YEARLY
//   STRIPE_PRICE_BUSINESS_MONTHLY
//   STRIPE_PRICE_BUSINESS_YEARLY
//   STRIPE_PRICE_ENTERPRISE_MONTHLY
//   STRIPE_PRICE_ENTERPRISE_YEARLY

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import process from "node:process";

function loadEnvLocal() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal();

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "http://127.0.0.1:54321";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeSecret = process.env.STRIPE_SECRET_KEY ?? null;
const stripeVersion = "2026-02-25.clover";
const dryRun = process.argv.includes("--dry-run");

if (!serviceKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const planMap = [
  {
    slug: "starter",
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? null,
    yearly: process.env.STRIPE_PRICE_STARTER_YEARLY ?? null,
  },
  {
    slug: "professional",
    monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY ?? null,
    yearly: process.env.STRIPE_PRICE_PROFESSIONAL_YEARLY ?? null,
  },
  {
    slug: "business",
    monthly: process.env.STRIPE_PRICE_BUSINESS_MONTHLY ?? null,
    yearly: process.env.STRIPE_PRICE_BUSINESS_YEARLY ?? null,
  },
  {
    slug: "enterprise",
    monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY ?? null,
    yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY ?? null,
  },
];

function validatePriceId(priceId, label) {
  if (!priceId) return null;
  if (!priceId.startsWith("price_")) {
    return `${label} must start with price_`;
  }
  return null;
}

async function fetchStripePrice(priceId) {
  if (!stripeSecret || !priceId) return null;
  const response = await fetch(`https://api.stripe.com/v1/prices/${priceId}`, {
    headers: {
      Authorization: `Bearer ${stripeSecret}`,
      "Stripe-Version": stripeVersion,
    },
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message ?? `Unable to fetch Stripe price ${priceId}`);
  }
  return json;
}

let hasValidationError = false;
for (const plan of planMap) {
  for (const [label, priceId] of [
    ["monthly", plan.monthly],
    ["yearly", plan.yearly],
  ]) {
    const validation = validatePriceId(priceId, `${plan.slug}.${label}`);
    if (validation) {
      hasValidationError = true;
      console.error(validation);
    }
  }
}

if (hasValidationError) {
  process.exit(1);
}

for (const plan of planMap) {
  const update = {};
  if (plan.monthly) update.stripe_price_id_monthly = plan.monthly;
  if (plan.yearly) update.stripe_price_id_yearly = plan.yearly;

  if (plan.monthly && stripeSecret) {
    const monthlyPrice = await fetchStripePrice(plan.monthly);
    update.monthly_amount = monthlyPrice.unit_amount ?? null;
    update.currency = (monthlyPrice.currency ?? "AED").toUpperCase();
  }

  if (plan.yearly && stripeSecret) {
    const yearlyPrice = await fetchStripePrice(plan.yearly);
    update.yearly_amount = yearlyPrice.unit_amount ?? null;
    update.currency = (yearlyPrice.currency ?? "AED").toUpperCase();
  }

  if (Object.keys(update).length === 0) {
    console.log(`No price IDs configured for ${plan.slug}, skipping.`);
    continue;
  }

  if (dryRun) {
    console.log(`Would update ${plan.slug}: ${JSON.stringify(update)}`);
    continue;
  }

  const { error } = await admin.from("billing_plans").update(update).eq("slug", plan.slug);
  if (error) {
    console.error(`Failed to update ${plan.slug}:`, error.message);
    process.exit(1);
  }

  console.log(`Updated ${plan.slug}`);
}

console.log(dryRun ? "Stripe plan sync dry-run complete." : "Stripe plan sync complete.");
