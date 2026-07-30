import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// APPSEC-09 Phase 3 — business settings, invitations and branding validation.
// Invitation EXPIRY (APPSEC-10) is deliberately out of scope and asserted to
// remain unimplemented.

import {
  addBranchSchema,
  addServiceSchema,
  businessLogoSchema,
  inviteTeammateSchema,
  isOwnedLogoPath,
  revokeInvitationSchema,
  updateBusinessSchema,
  INVITABLE_ROLES,
} from "../src/lib/validation/business-settings.js";

const BIZ = "c883e981-3627-4482-be63-348b0950f15e";
const OTHER_BIZ = "11111111-2222-4333-8444-555566667777";
const ok = (r) => r.success === true;

// --- business profile -------------------------------------------------------

test("settings: valid profile payload accepted, Arabic preserved", () => {
  const r = updateBusinessSchema.safeParse({
    name: "  ورشة الإمارات  ",
    legalName: "Emirates Workshop LLC",
    tagline: "Built on Trust",
    country: "AE",
    defaultLanguage: "ar",
  });
  assert.equal(ok(r), true);
  assert.equal(r.data.name, "ورشة الإمارات");
  assert.equal(r.data.defaultLanguage, "ar");
});

test("settings: blank business name rejected", () => {
  assert.equal(ok(updateBusinessSchema.safeParse({ name: "   " })), false);
  assert.equal(ok(updateBusinessSchema.safeParse({ name: "" })), false);
});

test("settings: country/default_language keep their column defaults when blank", () => {
  // Both are free-text inputs with `text not null default` columns, so blank
  // must fall back rather than be rejected or allowlisted.
  const r = updateBusinessSchema.safeParse({ name: "Revora Garage", country: "", defaultLanguage: "" });
  assert.equal(ok(r), true);
  assert.equal(r.data.country, "AE");
  assert.equal(r.data.defaultLanguage, "en");
  // Abusive length is still refused.
  assert.equal(
    ok(updateBusinessSchema.safeParse({ name: "Revora Garage", country: "A".repeat(200) })),
    false,
  );
});

// --- branches ---------------------------------------------------------------

test("settings: branch requires a name and validates optional contacts", () => {
  assert.equal(ok(addBranchSchema.safeParse({ name: "Main" })), true);
  assert.equal(ok(addBranchSchema.safeParse({ name: "  " })), false);
  assert.equal(ok(addBranchSchema.safeParse({ name: "Main", email: "not-an-email" })), false);
  assert.equal(ok(addBranchSchema.safeParse({ name: "Main", phone: "letters here" })), false);
  const good = addBranchSchema.safeParse({ name: "Main", phone: "+971 4 123 4567", email: "b@x.com" });
  assert.equal(ok(good), true);
  assert.equal(good.data.phone, "+971 4 123 4567");
});

// --- services ---------------------------------------------------------------

test("settings: service price stays nullable, rejects non-numeric and negative", () => {
  const blank = addServiceSchema.safeParse({ name: "Oil change", defaultPrice: "" });
  assert.equal(ok(blank), true);
  assert.equal(blank.data.defaultPrice, undefined); // persisted as null

  const priced = addServiceSchema.safeParse({ name: "Oil change", defaultPrice: "150.50" });
  assert.equal(ok(priced), true);
  assert.equal(priced.data.defaultPrice, 150.5);

  for (const bad of ["abc", "-10", "1e999"]) {
    assert.equal(
      ok(addServiceSchema.safeParse({ name: "Oil change", defaultPrice: bad })),
      false,
      `${bad} should be rejected`,
    );
  }
  assert.equal(ok(addServiceSchema.safeParse({ name: "  " })), false);
});

// --- invitations ------------------------------------------------------------

test("invitations: only manager/employee roles are invitable", () => {
  assert.deepEqual(INVITABLE_ROLES, ["manager", "employee"]);
  for (const role of INVITABLE_ROLES) {
    assert.equal(ok(inviteTeammateSchema.safeParse({ email: "t@x.com", role })), true);
  }
  // Privileged and non-staff roles from the member_role enum must be refused.
  for (const role of ["super_admin", "business_owner", "customer", "admin", ""]) {
    assert.equal(
      ok(inviteTeammateSchema.safeParse({ email: "t@x.com", role })),
      false,
      `${role || "(blank)"} must not be invitable`,
    );
  }
});

test("invitations: email is validated and lowercased, identity is not client-supplied", () => {
  const r = inviteTeammateSchema.safeParse({ email: "  Tech@Example.COM ", role: "employee" });
  assert.equal(ok(r), true);
  assert.equal(r.data.email, "tech@example.com"); // matches the pending-invite unique index
  assert.equal(ok(inviteTeammateSchema.safeParse({ email: "nope", role: "employee" })), false);
  assert.equal(ok(inviteTeammateSchema.safeParse({ email: "", role: "employee" })), false);

  // business_id / invited_by can never enter through the payload.
  const stripped = inviteTeammateSchema.safeParse({
    email: "t@x.com",
    role: "manager",
    business_id: OTHER_BIZ,
    invited_by: BIZ,
  });
  assert.equal("business_id" in stripped.data, false);
  assert.equal("invited_by" in stripped.data, false);
});

test("invitations: revoke requires a well-formed id", () => {
  assert.equal(ok(revokeInvitationSchema.safeParse({ id: "x" })), false);
  assert.equal(ok(revokeInvitationSchema.safeParse({ id: "" })), false);
  assert.equal(ok(revokeInvitationSchema.safeParse({ id: BIZ })), true);
});

// --- logo / storage ---------------------------------------------------------

test("logo: only image uploads with a real size are accepted", () => {
  const base = {
    objectPath: `${BIZ}/branding/8f1e-logo.png`,
    fileName: "logo.png",
    mimeType: "image/png",
    sizeBytes: "2048",
  };
  assert.equal(ok(businessLogoSchema.safeParse(base)), true);

  // Non-image types are refused (mirrors the uploader's accept="image/*").
  for (const mime of ["application/pdf", "text/html", "application/octet-stream", ""]) {
    assert.equal(
      ok(businessLogoSchema.safeParse({ ...base, mimeType: mime })),
      false,
      `${mime || "(blank)"} should be rejected`,
    );
  }
  // Zero-byte and garbage sizes are refused.
  for (const size of ["0", "-1", "abc", ""]) {
    assert.equal(
      ok(businessLogoSchema.safeParse({ ...base, sizeBytes: size })),
      false,
      `size ${size || "(blank)"} should be rejected`,
    );
  }
  assert.equal(ok(businessLogoSchema.safeParse({ ...base, objectPath: "" })), false);
});

test("logo: storage path must sit in the authenticated business's namespace", () => {
  assert.equal(isOwnedLogoPath(`${BIZ}/branding/8f1e-logo.png`, BIZ), true);

  // Cross-tenant, traversal, absolute and malformed paths are all refused.
  const rejected = [
    `${OTHER_BIZ}/branding/8f1e-logo.png`, // another business
    `${BIZ}/evidence/8f1e-logo.png`, // wrong entity folder
    `${BIZ}/branding/../../${OTHER_BIZ}/branding/x.png`, // traversal
    `../${BIZ}/branding/logo.png`,
    `/${BIZ}/branding/logo.png`, // absolute
    `${BIZ}\\branding\\logo.png`, // backslash
    `${BIZ}/branding/nested/logo.png`, // extra segment
    `${BIZ}/branding/`, // empty file segment
    BIZ,
    "",
  ];
  for (const p of rejected) {
    assert.equal(isOwnedLogoPath(p, BIZ), false, `${p} should be rejected`);
  }
  assert.equal(isOwnedLogoPath(null, BIZ), false);
  assert.equal(isOwnedLogoPath(`${BIZ}/branding/logo.png`, null), false);
});

// --- static regressions -----------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const settingsDir = path.resolve(here, "../src/app/[locale]/(dashboard)/settings/business");
const read = (f) => readFileSync(path.join(settingsDir, f), "utf8");
const settingsActions = read("actions.ts");
const inviteActions = read("invite-actions.ts");
const logoActions = read("logo-actions.ts");

test("security: settings actions validate and target the session's business", () => {
  assert.match(settingsActions, /updateBusinessSchema\.safeParse\(/);
  assert.match(settingsActions, /addBranchSchema\.safeParse\(/);
  assert.match(settingsActions, /addServiceSchema\.safeParse\(/);
  assert.match(settingsActions, /firstValidationMessage\(/);
  assert.match(settingsActions, /business_id:\s*business\.id/);
  assert.match(settingsActions, /\.eq\("id",\s*business\.id\)/);
});

test("security: invitation actions validate and scope revocation by business", () => {
  assert.match(inviteActions, /inviteTeammateSchema\.safeParse\(/);
  assert.match(inviteActions, /revokeInvitationSchema\.safeParse\(/);
  assert.match(inviteActions, /business_id:\s*business\.id/);
  assert.match(inviteActions, /\.eq\("business_id",\s*business\.id\)/);
});

test("security: logo action validates metadata and verifies the storage path", () => {
  assert.match(logoActions, /businessLogoSchema\.safeParse\(/);
  assert.match(logoActions, /isOwnedLogoPath\(objectPath,\s*business\.id\)/);
  // The raw client path must never flow straight into the branding record.
  assert.doesNotMatch(logoActions, /object_path"\s*\)\s*\)\s*;[\s\S]{0,80}publicUrl/);
});

test("APPSEC-10 remains open: no invitation expiry was introduced", () => {
  for (const src of [inviteActions, settingsActions]) {
    assert.doesNotMatch(src, /expires_at|expiry|expiresAt/i);
  }
  // No migration anywhere adds invitation expiry (and none was created here).
  const migrationsDir = path.resolve(here, "../../../supabase/migrations");
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  assert.ok(files.length > 0, "expected migrations to be present");
  assert.equal(files.some((f) => f.startsWith("0028")), false, "no migration 0028");
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    assert.doesNotMatch(
      sql,
      /business_invitations[\s\S]{0,600}expires_at/,
      `${file} must not add invitation expiry`,
    );
  }
});
