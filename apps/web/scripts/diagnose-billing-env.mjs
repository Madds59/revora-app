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

const planKeys = [
  ["starter", "monthly"],
  ["starter", "yearly"],
  ["professional", "monthly"],
  ["professional", "yearly"],
  ["business", "monthly"],
  ["business", "yearly"],
  ["enterprise", "monthly"],
  ["enterprise", "yearly"],
];

const envKeyFor = (slug, cadence) => `STRIPE_PRICE_${slug.toUpperCase()}_${cadence.toUpperCase()}`;

function isPriceId(value) {
  return typeof value === "string" && value.startsWith("price_");
}

async function fetchStripePrice(priceId) {
  if (!stripeSecret) return null;
  const response = await fetch(`https://api.stripe.com/v1/prices/${priceId}`, {
    headers: {
      Authorization: `Bearer ${stripeSecret}`,
      "Stripe-Version": "2026-02-25.clover",
    },
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message ?? `Unable to fetch Stripe price ${priceId}`);
  }
  return json;
}

async function main() {
  console.log("== Revora billing environment diagnostics ==\n");

  let invalid = false;
  for (const [slug, cadence] of planKeys) {
    const key = envKeyFor(slug, cadence);
    const value = process.env[key] ?? "";
    if (!value) {
      console.log(`${key}: missing`);
      continue;
    }
    if (!isPriceId(value)) {
      console.log(`${key}: invalid (must start with price_)`);
      invalid = true;
      continue;
    }
    console.log(`${key}: configured`);
    if (stripeSecret) {
      try {
        const price = await fetchStripePrice(value);
        console.log(`  -> Stripe price live: ${price?.id ?? value}`);
      } catch (error) {
        console.log(
          `  -> Stripe lookup failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        invalid = true;
      }
    }
  }

  if (serviceKey) {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin
      .from("billing_plans")
      .select("slug, monthly_amount, yearly_amount, stripe_price_id_monthly, stripe_price_id_yearly, currency")
      .order("sort_order", { ascending: true });

    if (error) {
      console.log(`\nbilling_plans: query failed -> ${error.message}`);
    } else {
      console.log("\nbilling_plans:");
      for (const plan of data ?? []) {
        console.log(
          `- ${plan.slug}: monthly=${plan.stripe_price_id_monthly ?? "unset"}, yearly=${plan.stripe_price_id_yearly ?? "unset"}, currency=${plan.currency}`,
        );
      }
    }
  } else {
    console.log("\nSUPABASE_SERVICE_ROLE_KEY: missing (cannot inspect billing_plans)");
  }

  if (stripeSecret) {
    console.log("\nStripe secret configured: yes");
  } else {
    console.log("\nStripe secret configured: no");
  }

  if (invalid) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
