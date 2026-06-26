import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
