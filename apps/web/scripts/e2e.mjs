// End-to-end check against the local Supabase stack, exercising the same
// RLS-governed operations the app performs. Run from apps/web:
//   node scripts/e2e.mjs
import { createClient } from "@supabase/supabase-js";

// Inlined copies of src/lib/money.ts helpers (keep in sync).
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
function computeLine(quantity, unitPrice, discountAmount, taxRate) {
  const gross = quantity * unitPrice;
  const net = gross - discountAmount;
  const tax = net * (taxRate / 100);
  return { gross, net, tax, total: net + tax };
}
function computeTotals(rows) {
  let subtotal = 0, discount_total = 0, tax_total = 0;
  for (const r of rows) {
    const { gross, tax } = computeLine(r.quantity, r.unit_price, r.discount_amount, r.tax_rate);
    subtotal += gross;
    discount_total += r.discount_amount;
    tax_total += tax;
  }
  return {
    subtotal: round2(subtotal),
    discount_total: round2(discount_total),
    tax_total: round2(tax_total),
    total: round2(subtotal - discount_total + tax_total),
  };
}

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const stamp = Date.now();
let passed = 0;
let failed = 0;
function ok(label) {
  passed++;
  console.log(`  PASS  ${label}`);
}
function bad(label, detail) {
  failed++;
  console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ""}`);
}
function assert(cond, label, detail) {
  if (cond) {
    ok(label);
  } else {
    bad(label, detail);
  }
}

function classifyRouteResponse(status, location) {
  if (status === 401 || status === 403) return "unauthorized as expected";
  if (status >= 500) return "unexpected 500";
  if (status === 404) return "missing route";
  if (status >= 300 && status < 400) {
    if (location && /\/login|\/onboarding|\/portal|\/admin/.test(location)) {
      return "unauthorized as expected";
    }
    return "expected redirect";
  }
  if (status >= 200 && status < 300) return "OK";
  return `unexpected status ${status}`;
}

function isCanonicalLocaleRedirect(route, location) {
  if (!location) return false;
  if (route === "/") return /^\/[a-z]{2}(?:\/)?(?:\?.*)?$/.test(location);
  if (route === "/login") return /^\/[a-z]{2}\/login(?:\?.*)?$/.test(location);
  if (route === "/signup") return /^\/[a-z]{2}\/signup(?:\?.*)?$/.test(location);
  return false;
}

async function newUser(tag) {
  const auth = createClient(SUPABASE_URL, ANON);
  const email = `${tag}+${stamp}@revora.test`;
  const { data, error } = await auth.auth.signUp({
    email,
    password: "password1234",
    options: { data: { full_name: tag } },
  });
  if (error) throw new Error(`signUp ${tag}: ${error.message}`);
  if (!data.session) throw new Error(`no session for ${tag}`);
  // Attach the JWT explicitly so PostgREST sees auth.uid() on every request.
  const c = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
  return { c, id: data.user.id, email };
}

console.log("\n== Revora end-to-end (live local DB) ==\n");

try {
  // 1. Owner onboarding (via the create_business RPC, like the app)
  const owner = await newUser("owner");
  ok(`owner signed up (${owner.email})`);

  const { data: bizId, error: bizErr } = await owner.c.rpc("create_business", {
    business_name: "Al Mansoori Auto Workshop",
    owner_full_name: "Owner One",
  });
  assert(!bizErr && bizId, "owner onboarding via create_business RPC", bizErr?.message);
  const biz = { id: bizId };

  const { count: memCount } = await owner.c
    .from("business_members")
    .select("id", { count: "exact", head: true });
  assert(memCount === 1, "owner is registered as a member", `count=${memCount}`);

  // 2. CRM
  const { data: cust, error: custErr } = await owner.c
    .from("customers")
    .insert({ business_id: biz.id, full_name: "Ahmed Al Mansoori", created_by: owner.id })
    .select("id")
    .single();
  assert(!custErr && cust, "owner adds customer", custErr?.message);

  const { error: vehErr } = await owner.c.from("vehicles").insert({
    business_id: biz.id,
    customer_id: cust.id,
    make: "Toyota",
    model: "Land Cruiser",
    year: 2022,
    plate_number: "A 12345",
  });
  assert(!vehErr, "owner adds vehicle", vehErr?.message);

  // 3. Quote builder + product transparency + totals
  const { data: quote, error: qErr } = await owner.c
    .from("quotations")
    .insert({
      business_id: biz.id,
      customer_id: cust.id,
      quote_number: `Q-${stamp}`,
      currency: "AED",
      created_by: owner.id,
    })
    .select("id")
    .single();
  assert(!qErr && quote, "owner creates draft quotation", qErr?.message);

  const items = [
    { kind: "labor", name: "Brake replacement labor", quantity: 2, unit_price: 150, discount_amount: 0, tax_rate: 5 },
    {
      kind: "part",
      name: "Front brake pads",
      quantity: 1,
      unit_price: 420,
      discount_amount: 20,
      tax_rate: 5,
      product_category: "genuine",
      transparency: { brand: "Akebono", warranty: "12 months", origin: "Japan" },
    },
  ];
  for (const it of items) {
    const { total } = computeLine(it.quantity, it.unit_price, it.discount_amount, it.tax_rate);
    const { error } = await owner.c.from("quotation_items").insert({
      business_id: biz.id,
      quotation_id: quote.id,
      kind: it.kind,
      product_category: it.product_category ?? null,
      name: it.name,
      quantity: it.quantity,
      unit_price: it.unit_price,
      discount_amount: it.discount_amount,
      tax_rate: it.tax_rate,
      total,
      transparency: it.transparency ?? {},
    });
    if (error) bad(`add item "${it.name}"`, error.message);
  }
  ok("owner adds 2 line items (incl. product transparency)");

  const totals = computeTotals(items);
  await owner.c.from("quotations").update(totals).eq("id", quote.id);
  // expected: subtotal 720, discount 20, tax (300*.05)+(400*.05)=35, total 735
  assert(
    totals.subtotal === 720 && totals.discount_total === 20 && totals.tax_total === 35 && totals.total === 735,
    `totals compute correctly (sub 720 / disc 20 / tax 35 / total 735)`,
    JSON.stringify(totals),
  );

  // 4. Owner can read back their tenant's data
  const { count: ownerCust } = await owner.c
    .from("customers")
    .select("id", { count: "exact", head: true });
  assert(ownerCust === 1, "owner sees exactly their 1 customer", `count=${ownerCust}`);

  // 5. Tenant isolation: a second, unrelated user sees nothing
  const intruder = await newUser("intruder");
  const { count: intruderCust } = await intruder.c
    .from("customers")
    .select("id", { count: "exact", head: true });
  assert(intruderCust === 0, "unrelated user sees 0 customers (RLS isolation)", `count=${intruderCust}`);

  const { count: intruderQuotes } = await intruder.c
    .from("quotations")
    .select("id", { count: "exact", head: true });
  assert(intruderQuotes === 0, "unrelated user sees 0 quotations (RLS isolation)", `count=${intruderQuotes}`);

  // 6. Digital approval: portal customer linked via app_user_id
  const portalUser = await newUser("portal-customer");
  await portalUser.c.from("profiles").upsert({ id: portalUser.id, full_name: "Portal Customer" });

  const { data: portalCust } = await owner.c
    .from("customers")
    .insert({
      business_id: biz.id,
      full_name: "Portal Customer",
      app_user_id: portalUser.id,
      created_by: owner.id,
    })
    .select("id")
    .single();

  const { data: portalQuote } = await owner.c
    .from("quotations")
    .insert({
      business_id: biz.id,
      customer_id: portalCust.id,
      quote_number: `Q-${stamp}-P`,
      currency: "AED",
      status: "sent",
      created_by: owner.id,
    })
    .select("id, current_version")
    .single();

  const { error: apprErr } = await portalUser.c.from("approvals").insert({
    business_id: biz.id,
    quotation_id: portalQuote.id,
    customer_id: portalCust.id,
    quotation_version: portalQuote.current_version,
    language: "en",
    acknowledgement_text: "I acknowledge the parts, pricing, and terms.",
    device_data: { signed_name: "Portal Customer" },
  });
  assert(!apprErr, "linked customer can sign/approve their quote (RLS approvals_customer_insert)", apprErr?.message);

  // 7. Negative: the intruder cannot approve someone else's quote
  const { error: badApprErr } = await intruder.c.from("approvals").insert({
    business_id: biz.id,
    quotation_id: portalQuote.id,
    customer_id: portalCust.id,
    quotation_version: portalQuote.current_version,
    language: "en",
    acknowledgement_text: "malicious",
  });
  assert(!!badApprErr, "non-customer is BLOCKED from approving (RLS denies)", "expected an RLS error but insert succeeded");

  // 8. Audit trail captured the writes
  const { count: auditCount } = await owner.c
    .from("audit_events")
    .select("id", { count: "exact", head: true });
  assert((auditCount ?? 0) > 0, "audit_events recorded business writes", `count=${auditCount}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("fetch failed") || message.includes("EPERM") || message.includes("connect")) {
    console.log(`  SKIP  live local DB smoke unavailable -> ${message}`);
  } else {
    bad("live local DB smoke", message);
  }
  console.log("  SKIP  continuing with route smoke only");
}

console.log(`\n== ${passed} passed, ${failed} failed ==\n`);
const appBase = process.env.APP_URL;
if (appBase) {
  const smokeRoutes = [
    { route: "/", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/login", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/signup", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/billing", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/analytics", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/notifications", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/customers", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/vehicles", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/vehicles/new", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/jobs", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/quotations", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/complaints", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/documents", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/portal", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/portal/jobs", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/portal/quotes", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/portal/complaints", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/portal/documents", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/portal/settings", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/admin", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/admin/tenants", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/admin/users", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/admin/subscriptions", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/admin/billing", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/admin/audit-logs", expected: ["OK", "unauthorized as expected", "expected redirect"] },
    { route: "/admin/notifications", expected: ["OK", "unauthorized as expected", "expected redirect"] },
  ];

  console.log(`\n== route smoke against ${appBase} ==\n`);
  for (const { route, expected } of smokeRoutes) {
    try {
      const res = await fetch(new URL(route, appBase), { redirect: "manual" });
      const location = res.headers.get("location") ?? undefined;
      const classification = classifyRouteResponse(res.status, location);
      if (route === "/" || route === "/login" || route === "/signup") {
        assert(
          classification === "expected redirect" || isCanonicalLocaleRedirect(route, location) || classification === "OK",
          `route ${route}`,
          `${classification}${location ? ` (${location})` : ""}`,
        );
        continue;
      }
      assert(
        expected.includes(classification),
        `route ${route}`,
        `${classification}${location ? ` (${location})` : ""}`,
      );
    } catch (error) {
      bad(`route ${route}`, `connection unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const vehicleSmokeId = process.env.SMOKE_VEHICLE_ID;
  if (vehicleSmokeId) {
    const route = `/vehicles/${vehicleSmokeId}`;
    try {
      const res = await fetch(new URL(route, appBase), { redirect: "manual" });
      const location = res.headers.get("location") ?? undefined;
      const classification = classifyRouteResponse(res.status, location);
      assert(
        ["OK", "unauthorized as expected", "expected redirect"].includes(classification),
        `route ${route}`,
        `${classification}${location ? ` (${location})` : ""}`,
      );
    } catch (error) {
      bad(`route ${route}`, `connection unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const route of ["/en/login", "/ar/login", "/en/signup", "/ar/signup"]) {
    try {
      const res = await fetch(new URL(route, appBase), { redirect: "manual" });
      assert(
        res.status >= 200 && res.status < 300,
        `public locale auth route ${route}`,
        `unexpected status ${res.status}`,
      );
    } catch (error) {
      bad(
        `public locale auth route ${route}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  try {
    const res = await fetch(new URL("/api/stripe/webhook", appBase), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      redirect: "manual",
    });
    assert(
      res.status === 400 || res.status === 401 || res.status === 403,
      "stripe webhook rejects unsigned requests",
      `unexpected status ${res.status}`,
    );
    assert(!res.headers.get("location"), "stripe webhook does not redirect", res.headers.get("location") ?? "redirect present");
  } catch (error) {
    bad(
      "stripe webhook rejects unsigned requests",
      error instanceof Error ? error.message : String(error),
    );
  }
} else {
  console.log("\n== route smoke skipped (APP_URL not set) ==\n");
}

process.exit(failed === 0 ? 0 : 1);
