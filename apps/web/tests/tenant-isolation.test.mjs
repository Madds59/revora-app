import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// Static, offline regression guards for APPSEC-17 (cross-tenant foreign-key
// injection on the 0034 invoicing/appointments tables). Same spirit as
// security-regressions.test.mjs: pure text assertions over source and
// migration files, no live services.
//
// WHY THESE ARE TEXT ASSERTIONS AND NOT INTEGRATION TESTS: the vulnerability
// lived in RLS `with check` clauses, and the only thing that can truly prove
// them is a live Postgres with two tenants. These guards instead pin the
// *shape* of the fix so a future migration cannot quietly drop it — which is
// exactly how 0034 regressed the rule 0008 had already established.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const webSrc = path.resolve(here, "../src");

const readSrc = (rel) => readFileSync(path.join(webSrc, rel), "utf8");
const readMigration = (name) =>
  readFileSync(path.join(repoRoot, "supabase/migrations", name), "utf8");

const hardening = readMigration("0035_tenant_isolation_hardening.sql");

/** Extract a single `create policy "<name>" ... ;` statement body. */
function policyBody(sql, policyName) {
  const start = sql.indexOf(`create policy "${policyName}"`);
  assert.notEqual(start, -1, `policy ${policyName} not found`);
  const end = sql.indexOf("\n\n", start);
  return sql.slice(start, end === -1 ? sql.length : end);
}

// --- APPSEC-17a: child rows must be pinned to their parent invoice's tenant.
// Before 0035 the `with check` only proved the row's own (client-supplied)
// business_id, so a manager of business A could attach a payment, line item or
// credit note to business B's invoice. The payment case was the worst: the
// SECURITY DEFINER recompute trigger then rewrote B's invoice to `paid`.
const INVOICE_CHILD_POLICIES = [
  "invoice_items_staff_manage",
  "invoice_payments_staff_manage",
  "invoice_credit_notes_staff_manage",
];

test("APPSEC-17: invoice child-table policies pin invoice_id to the row's own business", () => {
  for (const name of INVOICE_CHILD_POLICIES) {
    const body = policyBody(hardening, name);
    assert.match(
      body,
      /with check \(/,
      `${name} must have a with check clause`,
    );
    assert.match(
      body,
      /public\.invoice_in_business\(invoice_id, business_id\)/,
      `${name} must require the parent invoice to live in the same business`,
    );
  }
});

// --- APPSEC-17b: every FK on the parent tables must resolve in-tenant too.
test("APPSEC-17: invoices_staff_manage scopes every foreign key to the tenant", () => {
  const body = policyBody(hardening, "invoices_staff_manage");
  for (const helper of [
    "public.customer_in_business(customer_id, business_id)",
    "public.branch_in_business(branch_id, business_id)",
    "public.vehicle_in_business(vehicle_id, business_id)",
    "public.job_in_business(job_id, business_id)",
    "public.quotation_in_business(quotation_id, business_id)",
  ]) {
    assert.ok(body.includes(helper), `invoices_staff_manage must include ${helper}`);
  }
});

test("APPSEC-17: appointments_staff_manage scopes every foreign key to the tenant", () => {
  const body = policyBody(hardening, "appointments_staff_manage");
  for (const helper of [
    "public.customer_in_business(customer_id, business_id)",
    "public.branch_in_business(branch_id, business_id)",
    "public.vehicle_in_business(vehicle_id, business_id)",
    "public.quotation_in_business(quotation_id, business_id)",
  ]) {
    assert.ok(body.includes(helper), `appointments_staff_manage must include ${helper}`);
  }
});

test("APPSEC-17: portal appointment requests cannot borrow another customer's vehicle", () => {
  const body = policyBody(hardening, "appointments_customer_insert");
  assert.ok(
    body.includes("public.branch_in_business(branch_id, business_id)"),
    "customer insert must pin branch_id to the business",
  );
  assert.ok(
    body.includes("public.vehicle_in_customer(vehicle_id, customer_id)"),
    "customer insert must pin vehicle_id to the requesting customer, not just the business",
  );
});

test("APPSEC-17: branch_appointment_settings cannot be squatted on another tenant's branch", () => {
  const body = policyBody(hardening, "branch_appointment_settings_staff_manage");
  assert.ok(
    body.includes("public.branch_in_business(branch_id, business_id)"),
    "settings rows must pin branch_id to the owning business",
  );
});

// --- APPSEC-17c: the SECURITY DEFINER paths read with RLS off, so they must
// re-apply the tenant scope themselves.
test("APPSEC-17: recompute_invoice_paid_status only sums same-tenant payments", () => {
  const fn = hardening.slice(
    hardening.indexOf("function public.recompute_invoice_paid_status"),
  );
  assert.match(
    fn.slice(0, fn.indexOf("$$;")),
    /where p\.invoice_id = target_invoice_id\s*\n\s*and p\.business_id = inv\.business_id/,
    "the paid-total must exclude payments booked to a different business",
  );
});

test("APPSEC-17: confirm_appointment scopes capacity to the appointment's own business", () => {
  const fn = hardening.slice(hardening.indexOf("function public.confirm_appointment"));
  const body = fn.slice(0, fn.indexOf("$$;"));
  assert.match(
    body,
    /from public\.branch_appointment_settings s[\s\S]*?and s\.business_id = appt\.business_id/,
    "settings lookup must be tenant-scoped",
  );
  assert.match(
    body,
    /from public\.appointments a[\s\S]*?and a\.business_id = appt\.business_id/,
    "overlap count must be tenant-scoped so one tenant cannot fill another's calendar",
  );
});

// --- APPSEC-17d: the operator diagnostic must never be readable by tenants.
test("APPSEC-17: cross_tenant_reference_audit is not exposed to authenticated users", () => {
  assert.match(
    hardening,
    /revoke all on public\.cross_tenant_reference_audit from public, authenticated, anon;/,
    "the forensic view must stay service-role only",
  );
});

// --- APPSEC-17e: app-layer defense in depth. RLS is the real gate, but these
// actions previously piped a client-supplied id straight into an insert.
test("APPSEC-17: recordInvoicePayment resolves the invoice inside its own business", () => {
  const src = readSrc("app/[locale]/(dashboard)/invoices/actions.ts");
  const fn = src.slice(src.indexOf("export async function recordInvoicePayment"));
  const body = fn.slice(0, fn.indexOf("\nexport async function", 1));
  const insertAt = body.indexOf('.from("invoice_payments")');
  const lookupAt = body.indexOf('.from("invoices")');
  assert.notEqual(lookupAt, -1, "must look the invoice up before inserting a payment");
  assert.ok(lookupAt < insertAt, "the ownership lookup must happen before the insert");
  assert.match(
    body.slice(lookupAt, insertAt),
    /\.eq\("business_id", business\.id\)/,
    "the lookup must be scoped to the session-derived business",
  );
});

test("APPSEC-17: createAppointment validates customer, branch and vehicle in-tenant", () => {
  const src = readSrc("app/[locale]/(dashboard)/appointments/actions.ts");
  const fn = src.slice(src.indexOf("export async function createAppointment"));
  const body = fn.slice(0, fn.indexOf("\nexport async function", 1));
  const insertAt = body.indexOf('.from("appointments")');
  const guards = body.slice(0, insertAt);
  for (const table of ["customers", "branches", "vehicles"]) {
    assert.ok(
      guards.includes(`.from("${table}")`),
      `createAppointment must resolve ${table} before inserting`,
    );
  }
  assert.ok(
    guards.includes('.eq("customer_id", v.customerId)'),
    "the vehicle must be checked against the customer, not just the business",
  );
});

test("APPSEC-17: confirmAppointment does not pass a raw client string as a locale", () => {
  const src = readSrc("app/[locale]/(dashboard)/appointments/actions.ts");
  assert.doesNotMatch(
    src,
    /const locale = String\(formData\.get\("locale"\)/,
    "the locale must be narrowed to the AppLocale allowlist, not cast",
  );
});

// --- Portal branch visibility must stay RLS-scoped, never service-role.
test("portal branch listing is granted by RLS, not by the admin client", () => {
  assert.match(
    hardening,
    /create policy "branches_customer_read" on public\.branches/,
    "portal customers need a scoped SELECT policy on branches",
  );
  const policy = policyBody(hardening, "branches_customer_read");
  assert.ok(
    policy.includes("public.is_customer_of_business(business_id)"),
    "branch reads must be limited to businesses the caller is a customer of",
  );
  assert.ok(policy.includes("is_active"), "inactive branches must stay hidden");

  const page = readSrc("app/[locale]/(portal)/portal/appointments/new/page.tsx");
  assert.doesNotMatch(
    page,
    /createAdminClient/,
    "the portal booking page must never read through the service role",
  );
});

// --- Baseline response headers.
test("security headers: framing is denied and the powered-by banner is off", () => {
  const config = readFileSync(path.join(here, "../next.config.ts"), "utf8");
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /form-action 'self'/);
  assert.match(config, /base-uri 'self'/);
  assert.match(config, /X-Content-Type-Options/);
  assert.match(config, /Strict-Transport-Security/);
  assert.match(config, /poweredByHeader: false/);
});
