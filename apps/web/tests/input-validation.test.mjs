import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// APPSEC-09 Phase 1 — server-side input-validation schemas for quotations, jobs,
// and complaints. Offline unit tests (no Supabase, no secrets), importing the
// .js schema modules directly like the existing ratings/vehicle-intelligence
// tests.

import {
  firstValidationMessage,
  enumOf,
  money,
  quantity,
  requiredText,
  uuid,
} from "../src/lib/validation/common.js";
import {
  addItemSchema,
  createQuoteSchema,
  approveQuoteSchema,
  updateQuoteDetailsSchema,
} from "../src/lib/validation/quotations.js";
import {
  addJobTaskSchema,
  updateJobStatusSchema,
} from "../src/lib/validation/jobs.js";
import {
  addComplaintMessageSchema,
  updateComplaintSchema,
} from "../src/lib/validation/complaints.js";

const UID = "c883e981-3627-4482-be63-348b0950f15e";
const AR = "شكراً على المتابعة، سيتم إصلاح المكابح."; // Arabic content
const ok = (r) => r.success === true;

// --- common primitives -----------------------------------------------------

test("common: malformed UUID is rejected, valid UUID accepted", () => {
  assert.equal(ok(uuid("customer").safeParse("not-a-uuid")), false);
  assert.equal(ok(uuid("customer").safeParse("")), false);
  assert.equal(ok(uuid("customer").safeParse(UID)), true);
});

test("common: required string rejects blank-after-trim, accepts Arabic", () => {
  assert.equal(ok(requiredText("Name").safeParse("   ")), false);
  const arabic = requiredText("Message", 20000).safeParse(`  ${AR}  `);
  assert.equal(ok(arabic), true);
  assert.equal(arabic.data, AR); // trimmed, Unicode preserved
});

test("common: numbers reject NaN / Infinity / negative", () => {
  assert.equal(ok(money("unit price").safeParse("abc")), false);
  assert.equal(ok(money("unit price").safeParse("1e999")), false); // Infinity
  assert.equal(ok(money("unit price").safeParse("-5")), false);
  assert.equal(ok(money("unit price").safeParse("150.50")), true);
  assert.equal(quantity.safeParse("").data, 1); // blank -> default
});

test("common: enum rejects unknown value", () => {
  const schema = enumOf(["service", "labor", "product", "part"], "item type");
  assert.equal(ok(schema.safeParse("bogus")), false);
  assert.equal(ok(schema.safeParse("part")), true);
});

test("common: firstValidationMessage returns a safe curated string, not raw Zod", () => {
  const bad = money("unit price").safeParse("abc");
  const msg = firstValidationMessage(bad);
  assert.equal(typeof msg, "string");
  assert.doesNotMatch(msg, /zod|ZodError|issues|expected number, received/i);
  assert.ok(msg.length > 0 && msg.length <= 160);
});

// --- quotations ------------------------------------------------------------

test("quotations: valid create + line item accepted (with Arabic description)", () => {
  assert.equal(ok(createQuoteSchema.safeParse({ customerId: UID })), true);
  const item = addItemSchema.safeParse({
    quotationId: UID,
    name: "Brake pads",
    kind: "part",
    productCategory: "oem",
    quantity: "2",
    unitPrice: "150.50",
    discountAmount: "",
    taxRate: "5",
    description: AR,
  });
  assert.equal(ok(item), true);
  assert.equal(item.data.quantity, 2);
  assert.equal(item.data.unitPrice, 150.5);
  assert.equal(item.data.discountAmount, 0); // blank -> default 0
  assert.equal(item.data.description, AR);
});

test("quotations: malformed customer/vehicle id rejected", () => {
  assert.equal(ok(createQuoteSchema.safeParse({ customerId: "x" })), false);
  assert.equal(
    ok(createQuoteSchema.safeParse({ customerId: UID, vehicleId: "x" })),
    false,
  );
});

test("quotations: malformed line item (bad kind / negative qty / bad price) rejected", () => {
  const base = { quotationId: UID, name: "x", quantity: "1", unitPrice: "0", discountAmount: "0", taxRate: "0" };
  assert.equal(ok(addItemSchema.safeParse({ ...base, kind: "widget" })), false);
  assert.equal(ok(addItemSchema.safeParse({ ...base, kind: "part", quantity: "-3" })), false);
  assert.equal(ok(addItemSchema.safeParse({ ...base, kind: "part", unitPrice: "abc" })), false);
  assert.equal(ok(addItemSchema.safeParse({ ...base, kind: "part", name: "  " })), false);
});

test("quotations: invalid date rejected, valid date passed through unchanged", () => {
  assert.equal(
    ok(updateQuoteDetailsSchema.safeParse({ id: UID, expectedCompletionDate: "not-a-date" })),
    false,
  );
  const good = updateQuoteDetailsSchema.safeParse({ id: UID, expectedCompletionDate: "2026-08-01" });
  assert.equal(ok(good), true);
  assert.equal(good.data.expectedCompletionDate, "2026-08-01");
});

test("quotations: impossible calendar dates rejected (not normalized)", () => {
  // Date.parse would silently normalize these (e.g. Feb 30 -> Mar 2); the
  // schema must reject them instead of storing a shifted date.
  for (const bad of ["2026-02-30", "2026-04-31", "2025-02-29", "2026-13-01", "2026-00-10"]) {
    assert.equal(
      ok(updateQuoteDetailsSchema.safeParse({ id: UID, expectedCompletionDate: bad })),
      false,
      `${bad} should be rejected`,
    );
  }
  // Real leap day stays valid.
  assert.equal(
    ok(updateQuoteDetailsSchema.safeParse({ id: UID, expectedCompletionDate: "2028-02-29" })),
    true,
  );
});

test("quotations: approveQuote requires valid ids + signature", () => {
  assert.equal(
    ok(approveQuoteSchema.safeParse({ quotationId: UID, businessId: UID, customerId: UID, signature: "Aisha" })),
    true,
  );
  assert.equal(
    ok(approveQuoteSchema.safeParse({ quotationId: UID, businessId: "x", customerId: UID, signature: "Aisha" })),
    false,
  );
  assert.equal(
    ok(approveQuoteSchema.safeParse({ quotationId: UID, businessId: UID, customerId: UID, signature: "  " })),
    false,
  );
});

// --- jobs ------------------------------------------------------------------

test("jobs: valid payload accepted, malformed id + invalid status rejected", () => {
  assert.equal(ok(updateJobStatusSchema.safeParse({ id: UID, status: "in_progress" })), true);
  assert.equal(ok(updateJobStatusSchema.safeParse({ id: "x", status: "in_progress" })), false);
  assert.equal(ok(updateJobStatusSchema.safeParse({ id: UID, status: "launched" })), false);
  assert.equal(ok(addJobTaskSchema.safeParse({ jobId: UID, title: "  " })), false);
  assert.equal(ok(addJobTaskSchema.safeParse({ jobId: UID, title: "Replace filter" })), true);
});

// --- complaints ------------------------------------------------------------

test("complaints: valid English + Arabic messages accepted; blank body rejected", () => {
  assert.equal(ok(addComplaintMessageSchema.safeParse({ complaintId: UID, body: "Thanks for the update." })), true);
  assert.equal(ok(addComplaintMessageSchema.safeParse({ complaintId: UID, body: AR })), true);
  assert.equal(ok(addComplaintMessageSchema.safeParse({ complaintId: UID, body: "   " })), false);
});

test("complaints: malformed related identifiers rejected", () => {
  assert.equal(ok(addComplaintMessageSchema.safeParse({ complaintId: "x", body: "hi" })), false);
  assert.equal(
    ok(addComplaintMessageSchema.safeParse({ complaintId: UID, body: "hi", parentMessageId: "x" })),
    false,
  );
  assert.equal(ok(updateComplaintSchema.safeParse({ complaintId: UID, assignedTo: "x" })), false);
});

test("complaints: invalid status / severity rejected, valid accepted", () => {
  assert.equal(ok(updateComplaintSchema.safeParse({ complaintId: UID, status: "resolved", severity: "high" })), true);
  assert.equal(ok(updateComplaintSchema.safeParse({ complaintId: UID, status: "teleported" })), false);
  assert.equal(ok(updateComplaintSchema.safeParse({ complaintId: UID, severity: "apocalyptic" })), false);
});

// --- security regressions --------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const actionsDir = path.resolve(here, "../src/app/[locale]/(dashboard)");

test("security: addComplaintMessage schema has NO client business_id field", () => {
  // The tenant column must be session-derived, never validated from client input.
  const result = addComplaintMessageSchema.safeParse({
    complaintId: UID,
    body: "hi",
    business_id: "11111111-1111-1111-1111-111111111111",
    businessId: "22222222-2222-2222-2222-222222222222",
  });
  assert.equal(ok(result), true);
  assert.equal("business_id" in result.data, false);
  assert.equal("businessId" in result.data, false); // client-supplied biz id is dropped
});

test("security: complaints action derives business_id from session, not client", () => {
  const src = readFileSync(path.join(actionsDir, "complaints/actions.ts"), "utf8");
  assert.match(src, /business_id:\s*business\.id/); // session-derived
  assert.doesNotMatch(src, /business_id:\s*businessId\b/); // not client-trusted
});

test("security: target actions validate via safeParse before mutating", () => {
  for (const f of ["quotations/actions.ts", "jobs/actions.ts", "complaints/actions.ts"]) {
    const src = readFileSync(path.join(actionsDir, f), "utf8");
    assert.match(src, /\.safeParse\(/, `${f} should validate input via safeParse`);
    assert.match(src, /firstValidationMessage\(/, `${f} should surface safe validation messages`);
  }
});
