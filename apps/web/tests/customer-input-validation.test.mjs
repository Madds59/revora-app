import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// APPSEC-09 Phase 3 — customer dashboard mutation validation. Offline unit
// tests (no Supabase, no secrets), importing the .js schema modules directly
// like the Phase 1/2 suites.

import { firstValidationMessage } from "../src/lib/validation/common.js";
import {
  createCustomerSchema,
  updateCustomerSchema,
} from "../src/lib/validation/customers.js";

const UID = "c883e981-3627-4482-be63-348b0950f15e";
const AR_NAME = "محمد بن راشد";
const ok = (r) => r.success === true;

const validBase = {
  fullName: "Aisha Al Nuaimi",
  phone: "",
  email: "",
  preferredLanguage: "en",
};

// --- create / update payloads ----------------------------------------------

test("customers: valid English payload accepted", () => {
  const r = createCustomerSchema.safeParse({
    ...validBase,
    phone: "+971 4 123 4567",
    email: "aisha@example.com",
  });
  assert.equal(ok(r), true);
  assert.equal(r.data.fullName, "Aisha Al Nuaimi");
  assert.equal(r.data.email, "aisha@example.com");
});

test("customers: valid Arabic payload accepted and preserved", () => {
  const r = createCustomerSchema.safeParse({
    ...validBase,
    fullName: `  ${AR_NAME}  `,
    preferredLanguage: "ar",
  });
  assert.equal(ok(r), true);
  assert.equal(r.data.fullName, AR_NAME); // trimmed, Unicode intact
  assert.equal(r.data.preferredLanguage, "ar");
});

test("customers: blank-after-trim name rejected", () => {
  assert.equal(ok(createCustomerSchema.safeParse({ ...validBase, fullName: "   " })), false);
  assert.equal(ok(createCustomerSchema.safeParse({ ...validBase, fullName: "" })), false);
});

test("customers: malformed customer id rejected on update", () => {
  assert.equal(ok(updateCustomerSchema.safeParse({ ...validBase, id: "not-a-uuid" })), false);
  assert.equal(ok(updateCustomerSchema.safeParse({ ...validBase, id: "" })), false);
  assert.equal(ok(updateCustomerSchema.safeParse({ ...validBase, id: UID })), true);
});

// --- email / phone ----------------------------------------------------------

test("customers: optional email — blank allowed, malformed rejected", () => {
  const blank = createCustomerSchema.safeParse({ ...validBase, email: "" });
  assert.equal(ok(blank), true);
  assert.equal(blank.data.email, undefined); // stays blank -> persisted as null

  for (const bad of ["not-an-email", "a@b", "no@dot,com", "two @spaces.com"]) {
    assert.equal(
      ok(createCustomerSchema.safeParse({ ...validBase, email: bad })),
      false,
      `${bad} should be rejected`,
    );
  }
  // Case is preserved (the customer surface does not lowercase today).
  const mixed = createCustomerSchema.safeParse({ ...validBase, email: "Aisha@Example.com" });
  assert.equal(mixed.data.email, "Aisha@Example.com");
});

test("customers: international phone notation preserved, garbage rejected", () => {
  for (const good of ["+971 4 123 4567", "(04) 123-4567", "+44 20 7946 0958", "050.123.4567"]) {
    const r = createCustomerSchema.safeParse({ ...validBase, phone: good });
    assert.equal(ok(r), true, `${good} should be accepted`);
    assert.equal(r.data.phone, good); // verbatim: no country reformatting, no coercion
  }
  for (const bad of ["call me maybe", "12", "+", "1234567890123456789012345678901234567890"]) {
    assert.equal(
      ok(createCustomerSchema.safeParse({ ...validBase, phone: bad })),
      false,
      `${bad} should be rejected`,
    );
  }
  // A leading zero must survive as text, never become a number.
  const local = createCustomerSchema.safeParse({ ...validBase, phone: "0501234567" });
  assert.equal(local.data.phone, "0501234567");
});

// --- language ---------------------------------------------------------------

test("customers: language defaults to en when blank, rejects unknown values", () => {
  const blank = createCustomerSchema.safeParse({ ...validBase, preferredLanguage: "" });
  assert.equal(ok(blank), true);
  assert.equal(blank.data.preferredLanguage, "en");
  assert.equal(ok(createCustomerSchema.safeParse({ ...validBase, preferredLanguage: "fr" })), false);
});

// --- security ---------------------------------------------------------------

test("customers: client-supplied tenant identity is stripped by the schema", () => {
  const r = createCustomerSchema.safeParse({
    ...validBase,
    business_id: "11111111-1111-4111-8111-111111111111",
    businessId: "22222222-2222-4222-8222-222222222222",
    created_by: "33333333-3333-4333-8333-333333333333",
  });
  assert.equal(ok(r), true);
  assert.equal("business_id" in r.data, false);
  assert.equal("businessId" in r.data, false);
  assert.equal("created_by" in r.data, false);
});

test("customers: failures return a curated message, not raw Zod issues", () => {
  const bad = createCustomerSchema.safeParse({ ...validBase, fullName: "" });
  const msg = firstValidationMessage(bad);
  assert.doesNotMatch(msg, /zod|ZodError|issues|invalid_type|expected/i);
  assert.ok(msg.length > 0 && msg.length <= 160);
});

// --- static regressions (supplementing the behavioral tests above) ----------

const here = path.dirname(fileURLToPath(import.meta.url));
const actions = readFileSync(
  path.resolve(here, "../src/app/[locale]/(dashboard)/customers/actions.ts"),
  "utf8",
);

test("security: customer actions validate before mutating and scope by session", () => {
  assert.match(actions, /createCustomerSchema\.safeParse\(/);
  assert.match(actions, /updateCustomerSchema\.safeParse\(/);
  assert.match(actions, /firstValidationMessage\(/);
  // Tenant identity is session-derived on insert...
  assert.match(actions, /business_id:\s*business\.id/);
  // ...and the update is explicitly constrained to the session's business.
  assert.match(actions, /\.eq\("business_id",\s*business\.id\)/);
  // Non-enumerating response for a missing/cross-tenant customer.
  assert.match(actions, /Customer not found or unavailable\./);
});
