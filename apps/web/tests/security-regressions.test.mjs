import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// Static, offline regression guards for findings in
// docs/security/APPSEC_REVIEW_REPORT.md. No live services, no secrets, no
// network calls — pure text assertions against source/migration files, in the
// same spirit as the existing migration-text checks in notifications.test.mjs.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const webSrc = path.resolve(here, "../src");

function read(relativeToWebSrc) {
  return readFileSync(path.join(webSrc, relativeToWebSrc), "utf8");
}

// --- APPSEC-07: raw PostgREST/Postgres error messages must not be returned to
// the caller. These 21 files were fixed in the security/revora-trust-safety-program
// pass (see APPSEC_REVIEW_REPORT.md APPSEC-07). `onboarding/actions.ts` is
// intentionally excluded here: it has one Supabase Auth SDK error message
// (`authError.message`) that is a deliberate, documented exception, not a leak.
const FIXED_ACTION_FILES = [
  "app/[locale]/(portal)/portal/actions.ts",
  "app/[locale]/(dashboard)/customers/actions.ts",
  "app/[locale]/(dashboard)/settings/business/logo-actions.ts",
  "app/[locale]/(dashboard)/settings/business/actions.ts",
  "app/[locale]/(dashboard)/settings/business/invite-actions.ts",
  "app/[locale]/(dashboard)/complaints/actions.ts",
  "app/[locale]/(dashboard)/vehicles/actions.ts",
  "app/[locale]/(dashboard)/quotations/actions.ts",
  "app/[locale]/(dashboard)/jobs/actions.ts",
  "app/[locale]/(dashboard)/notifications/actions.ts",
  "app/[locale]/(dashboard)/billing/actions.ts",
  "app/[locale]/(admin)/admin/actions.ts",
  "lib/vehicle-intelligence/service.ts",
  "lib/vehicle-intelligence/actions.ts",
  "lib/vehicle-intelligence/search-service.ts",
  "lib/actions/membership-bundles.ts",
  "lib/actions/retainer-scenarios.ts",
  "lib/evidence-actions.ts",
  "lib/document-actions.ts",
  "lib/notifications/service.ts",
  "app/[locale]/(dashboard)/tools/retainer-calculator/page.tsx",
];

// Matches the leaked shape regardless of the error variable's name, e.g.
// `error: error.message`, `error: quoteError?.message`, `error: itemError.message`.
const RAW_DB_ERROR_LEAK = /error:\s*[A-Za-z]*[Ee]rror\??\.message/;

test("APPSEC-07: fixed action/service files no longer leak raw error.message to callers", () => {
  for (const relativePath of FIXED_ACTION_FILES) {
    const contents = read(relativePath);
    assert.doesNotMatch(
      contents,
      RAW_DB_ERROR_LEAK,
      `${relativePath} appears to return a raw database error message again`,
    );
  }
});

// --- APPSEC-07b: the same raw-error pattern, but in the read-path — page
// components rendering a Supabase query's `error.message` (or a similarly
// named `*Error.message` / `*ErrorState.message`) directly in JSX, e.g.
// `<p>{error.message}</p>` or `<p>{jobError.message}</p>`. Unlike the
// APPSEC-07 test above (a closed list of already-fixed files), this scans
// every `page.tsx` under `app/` so a *new* page introducing the same mistake
// also fails — the APPSEC-07 fix taught us a directory-scoped first pass
// misses files, so this guard is pattern-based and tree-wide instead.
//
// Documented exceptions (not scanned here, tracked elsewhere):
//   - `app/[locale]/(auth)/**` — Supabase Auth SDK error messages are
//     designed to be user-facing (e.g. "Invalid login credentials"); see
//     APPSEC-08. These live in `*-client.tsx` components, not `page.tsx`,
//     and are excluded by path below for clarity even though the pattern
//     wouldn't currently match them.
//   - `components/file-upload.tsx` — Supabase Storage SDK error message
//     (e.g. file-too-large), same SDK-designed-message category; not a
//     `page.tsx` file, so it is outside this scan's glob by construction.
const PAGE_FILE_EXCEPTIONS = ["app/[locale]/(auth)/"];

function findPageFiles(rootRelativeToWebSrc) {
  const root = path.join(webSrc, rootRelativeToWebSrc);
  return readdirSync(root, { recursive: true })
    .filter((entry) => entry.endsWith("page.tsx"))
    .map((entry) => path.posix.join(rootRelativeToWebSrc, entry.split(path.sep).join("/")))
    .filter((relativePath) => !PAGE_FILE_EXCEPTIONS.some((ex) => relativePath.includes(ex)));
}

// Matches a JSX expression rendering an error-like identifier's `.message`,
// e.g. `{error.message}`, `{jobError.message}`, `{revenueErrorState.message}`.
const JSX_ERROR_MESSAGE_LEAK = /\{[A-Za-z_$]*[Ee]rror[A-Za-z_$]*\??\.message\}/;
// Matches String(error)/JSON.stringify(error)-style stringification of an
// error-like identifier for display.
const STRINGIFIED_ERROR_LEAK = /(?:String|JSON\.stringify)\([A-Za-z_$]*[Ee]rror[A-Za-z_$]*\)/;
// Matches a template literal interpolating a whole error-like identifier.
const TEMPLATE_ERROR_LEAK = /\$\{[A-Za-z_$]*[Ee]rror[A-Za-z_$]*\}/;

test("APPSEC-07b: no page.tsx renders a raw query error to the user", () => {
  const pageFiles = findPageFiles("app");
  assert.ok(pageFiles.length > 30, "expected to find a substantial number of page.tsx files to scan");

  for (const relativePath of pageFiles) {
    const contents = read(relativePath);
    assert.doesNotMatch(
      contents,
      JSX_ERROR_MESSAGE_LEAK,
      `${relativePath} appears to render a raw error.message in JSX`,
    );
    assert.doesNotMatch(
      contents,
      STRINGIFIED_ERROR_LEAK,
      `${relativePath} appears to stringify a raw error object for display`,
    );
    assert.doesNotMatch(
      contents,
      TEMPLATE_ERROR_LEAK,
      `${relativePath} appears to interpolate a raw error object in a template literal`,
    );
  }
});

// --- APPSEC-02: account_intent must never be promoted into an authorization
// check at the database layer (it is onboarding/routing metadata only).
test("APPSEC-02: account_intent never appears in any RLS-policy-bearing migration", () => {
  const migrationFiles = [
    "0002_rls_policies.sql",
    "0006_customer_complaints_hardening.sql",
    "0008_secure_quote_creation.sql",
    "0009_platform_admins.sql",
    "0013_portal_quote_response_and_notifications.sql",
    "0016_storage_media.sql",
    "0017_media_evidence_read.sql",
    "0018_approval_signature.sql",
    "0024_vehicle_intelligence.sql",
    "0026_membership_bundles.sql",
    "0027_business_ratings.sql",
    "0030_notifications_foundation.sql",
  ];
  for (const file of migrationFiles) {
    const contents = readFileSync(
      path.join(repoRoot, "supabase/migrations", file),
      "utf8",
    );
    assert.doesNotMatch(
      contents,
      /account_intent/,
      `${file} must not reference account_intent — it is onboarding metadata, never an authorization check`,
    );
  }
});

// --- Platform admin self-elevation safeguards (see AUTHORIZATION_MATRIX.md).
test("platform_admins: self-elevation and self-removal safeguards remain present", () => {
  const contents = readFileSync(
    path.join(repoRoot, "supabase/migrations/0009_platform_admins.sql"),
    "utf8",
  );
  assert.match(
    contents,
    /create or replace function public\.is_super_admin\(\)/,
    "is_super_admin() must exist",
  );
  assert.match(
    contents,
    /if not public\.is_super_admin\(\) then\s*\n\s*raise exception 'forbidden'/,
    "admin_set_super_admin() must reject callers who are not already a super admin",
  );
  assert.match(
    contents,
    /you cannot remove your own super admin access/,
    "admin_set_super_admin() must block self-removal",
  );
  assert.doesNotMatch(
    contents,
    /account_intent/,
    "platform admin grants must never be derived from account_intent",
  );
});

// --- APPSEC-18 / APPSEC-19: cross-tenant parent integrity and one approval path
//
// The behavioural proof for these lives in
// supabase/tests/tenant_parent_integrity_tests.sql, which exercises the
// policies against a real PostgreSQL (`node scripts/db-test.mjs --reset --run
// ../../supabase/tests/tenant_parent_integrity_tests.sql`). These static guards
// exist so a reintroduced write path fails in `pnpm test` during review,
// before anyone needs a database to notice.

const migrationsDir = path.join(repoRoot, "supabase/migrations");
const allMigrations = readdirSync(migrationsDir)
  .filter((f) => /^\d{4}.*\.sql$/.test(f))
  .map((f) => ({ name: f, sql: readFileSync(path.join(migrationsDir, f), "utf8") }));

test("APPSEC-18: the tenant parent/child invariant is enforced structurally", () => {
  const sql = allMigrations.map((m) => m.sql).join("\n");
  // The relation set is derived from the catalog, so a table added later
  // inherits the invariant instead of silently reintroducing the class.
  assert.match(sql, /create or replace function public\.tenant_parent_child_relations\(\)/);
  // Composite FK (fk_column, business_id) -> parent (id, business_id).
  assert.match(sql, /foreign key \(%I, business_id\)/);
  assert.match(sql, /references public\.%I \(id, business_id\)/);
  // The census must refuse to constrain corrupt data rather than delete it.
  assert.match(sql, /refusing to add integrity constraints over corrupt data/);
  assert.doesNotMatch(sql, /delete from public\.\w+ where business_id is distinct from/i);
});

test("APPSEC-18: handle_quote_approved validates its own tenant invariant", () => {
  const m = allMigrations.find((x) => /handle_quote_approved/.test(x.sql)
    && /tenant mismatch/.test(x.sql));
  assert.ok(m, "a migration must redefine handle_quote_approved with a tenant check");
  // The privileged trigger must compare the approval against the quotation it
  // loaded, and fail closed -- not return NEW on a mismatch.
  assert.match(m.sql, /q\.business_id is distinct from new\.business_id/);
  assert.match(m.sql, /q\.customer_id is distinct from new\.customer_id/);
  assert.match(m.sql, /raise exception[\s\S]{0,200}tenant mismatch/);
});

test("APPSEC-19: exactly one approval write path exists", () => {
  const portal = read("app/[locale]/(portal)/portal/actions.ts");
  const dashboard = read("app/[locale]/(dashboard)/quotations/actions.ts");

  // Both approval entry points go through the canonical RPC...
  assert.match(portal, /rpc\("submit_quote_approval"/);
  assert.match(dashboard, /rpc\("submit_quote_approval"/);

  // ...and neither writes the table directly.
  for (const [label, src] of [["portal", portal], ["dashboard", dashboard]]) {
    assert.doesNotMatch(
      src,
      /from\(\s*["']approvals["']\s*\)\s*\.\s*(insert|upsert|update|delete)/,
      `${label} must not write public.approvals directly`,
    );
  }

  // The privilege layer, not developer discipline, keeps the second door shut.
  const revoke = allMigrations.find((m) =>
    /revoke\s+insert[^;]*on\s+public\.approvals/i.test(m.sql));
  assert.ok(revoke, "a migration must revoke INSERT on public.approvals");

  // The RPC must enforce the state machine the direct insert used to own,
  // otherwise moving onto it would have lost those checks.
  const rpc = allMigrations.find((m) =>
    /create or replace function public\.submit_quote_approval/.test(m.sql)
    && /version mismatch/.test(m.sql));
  assert.ok(rpc, "submit_quote_approval must enforce quote version");
  assert.match(rpc.sql, /status not in \('sent', 'revised'\)/);
  assert.match(rpc.sql, /already been approved/);
});

// --- APPSEC-20: invoice financial invariants
//
// Behavioural proof: supabase/tests/invoice_financial_integrity_tests.sql
// (`pnpm test:db:finance`). At schema 0040 that suite reports 21 failures --
// header totals stay at 0 after a line is added, balance_due reaches -1230,
// and 700 is credited against a 630 invoice -- which is what establishes these
// guards are protecting a real fix rather than restating an intention.

test("APPSEC-20: invoice header totals are database-owned", () => {
  const m = allMigrations.find((x) =>
    /create or replace function public\.recompute_invoice_totals/.test(x.sql));
  assert.ok(m, "a migration must define recompute_invoice_totals()");

  // Triggers on all three mutation verbs: a DELETE-only gap would let a
  // removed line leave the header overstated.
  assert.match(m.sql, /after insert or update or delete on public\.invoice_items/);
  // The line total is derived, never taken from the client.
  assert.match(m.sql, /before insert or update on public\.invoice_items/);
  assert.match(m.sql, /new\.total := public\.invoice_line_total/);

  // The arithmetic must match apps/web/src/lib/money.ts: tax applies to the
  // post-discount net, and total = subtotal - discount + tax.
  assert.match(m.sql, /quantity \* unit_price - discount_amount\) \* tax_rate \/ 100/);
  assert.match(m.sql, /subtotal - t\.discount_total \+ t\.tax_total/);
});

test("APPSEC-20: overpayment and over-crediting are refused", () => {
  const m = allMigrations.find((x) =>
    /enforce_invoice_payment_ceiling/.test(x.sql));
  assert.ok(m, "a migration must define the payment ceiling");

  // BEFORE, so the row is refused rather than recorded then compensated.
  assert.match(m.sql, /before insert or update on public\.invoice_payments/);
  // The invoice row is locked, so two concurrent valid payments cannot
  // jointly overpay.
  assert.match(m.sql, /from public\.invoices where id = new\.invoice_id for update/);
  assert.match(m.sql, /overpayment is not supported/);
  // A stored amount_paid above total is unrepresentable too.
  assert.match(m.sql, /amount_paid >= 0 and amount_paid <= total/);
  // Credit notes are capped against the invoice total.
  assert.match(m.sql, /would exceed the invoice total/);
});

test("APPSEC-20: an issued invoice's lines are immutable", () => {
  const m = allMigrations.find((x) =>
    /enforce_invoice_items_draft_only/.test(x.sql));
  assert.ok(m, "a migration must enforce draft-only invoice lines");
  assert.match(m.sql, /before insert or update or delete on public\.invoice_items/);
  assert.match(m.sql, /issue a credit note instead/);
  // The application already enforced this rule; the point is that the database
  // now does too, so PostgREST cannot step around it.
  const actions = read("app/[locale]/(dashboard)/invoices/actions.ts");
  assert.match(actions, /Only draft invoices can be edited/);
});

// --- APPSEC-21: audit coverage and API-role least privilege
//
// Behavioural proof: supabase/tests/audit_and_privilege_tests.sql
// (`pnpm test:db:audit`). At schema 0041 that suite shows `anon` -- with no
// session at all -- successfully running TRUNCATE against every public table,
// and the entire financial lifecycle producing zero audit rows.

test("APPSEC-21: privileges RLS cannot govern are revoked from the API roles", () => {
  const m = allMigrations.find((x) =>
    /revoke truncate[^;]*on all tables in schema public/i.test(x.sql));
  assert.ok(m, "a migration must revoke TRUNCATE from the API roles");

  // RLS does not apply to TRUNCATE, so holding it defeats every policy.
  assert.match(m.sql, /revoke truncate, trigger, references on all tables in schema public\s*\n?\s*from anon, authenticated/i);

  // 0003 set ALTER DEFAULT PRIVILEGES to grant ALL on future tables, which
  // would hand TRUNCATE straight back to the next table created.
  assert.match(
    m.sql,
    /alter default privileges in schema public\s*\n?\s*revoke truncate, trigger, references on tables from anon, authenticated/i,
  );

  // audit_events must be append-only for the API roles.
  assert.match(m.sql, /revoke insert, update, delete on public\.audit_events from anon, authenticated/i);

  // service_role is the trusted server-side key and must NOT be stripped.
  assert.doesNotMatch(m.sql, /revoke[^;]*from[^;]*service_role/i);
});

test("APPSEC-21: the financial and inspection layers are audited", () => {
  const m = allMigrations.find((x) => /audited_tables\(\)/.test(x.sql));
  assert.ok(m, "a migration must expose audited_tables()");
  for (const t of [
    "invoices", "invoice_items", "invoice_payments", "invoice_credit_notes",
    "appointments", "vehicles", "complaint_evidence", "approval_events",
    "vehicle_inspections", "inspection_items",
  ]) {
    assert.ok(
      m.sql.includes(`'${t}'`),
      `${t} must be added to the audit trigger set`,
    );
  }
});

test("APPSEC-21: audit payloads drop credentials but keep business fields", () => {
  const m = allMigrations.find((x) => /audit_redact/.test(x.sql));
  assert.ok(m, "a migration must define audit_redact()");
  assert.match(m.sql, /token\|secret\|password\|encrypted/);
  // Both payload sides go through the filter.
  assert.match(m.sql, /public\.audit_redact\(to_jsonb\(old\)\)/);
  assert.match(m.sql, /public\.audit_redact\(to_jsonb\(new\)\)/);
  // The claim must stay accurate: tamper-RESISTANT, not tamper-proof.
  assert.match(m.sql, /not cryptographically immutable/i);
});

// --- TRUST-01: Phase 1 trusted-record completion
//
// Behavioural proof: supabase/tests/trusted_record_lifecycle_tests.sql
// (`pnpm test:db:lifecycle`), which builds one journey from customer to
// complaint resolution and reconstructs it in a single join, asserting tenant,
// customer and vehicle agreement at every hop. Before 0043 that file refuses to
// run at all, because the schema cannot represent the chain.

test("TRUST-01: a job can be traced to a vehicle", () => {
  const m = allMigrations.find((x) => /alter table public\.jobs add column if not exists vehicle_id/.test(x.sql));
  assert.ok(m, "a migration must add jobs.vehicle_id");

  // Backfilled from the quotation, scoped to the same tenant -- a backfill that
  // crossed tenants would fabricate service history.
  assert.match(m.sql, /set vehicle_id = q\.vehicle_id/);
  assert.match(m.sql, /q\.business_id = j\.business_id/);

  // Nullable on purpose, with the unresolved rows surfaced rather than guessed.
  assert.match(m.sql, /create or replace view public\.jobs_missing_vehicle/);
  assert.doesNotMatch(m.sql, /alter table public\.jobs[^;]*alter column vehicle_id set not null/i);
});

test("TRUST-01: performed work is distinguishable from quoted work", () => {
  const m = allMigrations.find((x) => /create table if not exists public\.job_performed_items/.test(x.sql));
  assert.ok(m, "a migration must create job_performed_items");
  // The link back to the quote is what makes extra and omitted work visible.
  assert.match(m.sql, /source_quotation_item_id uuid references public\.quotation_items/);
  assert.match(m.sql, /quantity numeric\(12,2\) not null default 1 check \(quantity > 0\)/);
  // Customer-facing exposure must not be widened silently: the portal gets
  // warranties, not internal workshop detail.
  assert.doesNotMatch(m.sql, /job_performed_items[\s\S]{0,400}is_customer_for_business/);
});

test("TRUST-01: a warranty is a coverage record, not wording", () => {
  const m = allMigrations.find((x) => /create table if not exists public\.warranties/.test(x.sql));
  assert.ok(m, "a migration must create warranties");
  for (const col of [
    "customer_id", "vehicle_id", "job_id", "invoice_id", "performed_item_id",
    "coverage_start", "coverage_end", "coverage_months", "coverage_mileage",
    "invoked_at", "complaint_id",
  ]) {
    assert.ok(m.sql.includes(col), `warranties must record ${col}`);
  }
  // A row must commit to something measurable, or it is free text again.
  assert.match(m.sql, /constraint warranties_has_duration/);
  assert.match(m.sql, /constraint warranties_claimed_has_invocation/);
});

test("TRUST-01: complaints can reach their originating context", () => {
  const m = allMigrations.find((x) => /complaint_category/.test(x.sql));
  assert.ok(m, "a migration must add the complaint category");
  assert.match(m.sql, /alter table public\.complaints add column if not exists vehicle_id/);
  assert.match(m.sql, /alter table public\.complaints add column if not exists invoice_id/);
  // Category is left NULL rather than guessed: a fabricated category corrupts
  // the grouping it exists to enable.
  assert.doesNotMatch(m.sql, /set category = '/);
});

test("TRUST-01: new tenant references inherit the APPSEC-18 invariant", () => {
  const m = allMigrations.find((x) => /apply_tenant_parent_integrity/.test(x.sql));
  assert.ok(m, "a migration must expose apply_tenant_parent_integrity()");
  // Idempotent, census-first, and actually invoked -- defining it without
  // calling it would leave the new references uncovered.
  assert.match(m.sql, /refusing to add integrity constraints over corrupt data/);
  assert.match(m.sql, /select public\.apply_tenant_parent_integrity\(\) into result/);
});
