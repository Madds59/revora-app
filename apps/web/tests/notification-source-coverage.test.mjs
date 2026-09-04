import assert from "node:assert/strict";
import test from "node:test";

// Every notification template that names a resource must be provable.
//
// authorizeEventForDispatch enforces resource ownership only when
// TEMPLATE_SOURCES has an entry with a `table` for the template. When an entry
// is missing, `source?.table` is undefined, the check is skipped, and the row
// dispatches without anyone proving the resource it names belongs to the
// event's business. A template added without a TEMPLATE_SOURCES entry is
// therefore silently weaker than every template around it.
//
// This suite pins that invariant so a future template cannot regress it by
// omission, which is exactly how invoice_issued / appointment_* were introduced.

import {
  NOTIFICATION_TEMPLATE_KEYS,
} from "../src/lib/notifications/templates.js";
import {
  authorizeEventForDispatch,
  persistablePayloadSchema,
  TEMPLATE_SOURCES,
} from "../src/lib/validation/notifications.js";

const BIZ = "c883e981-3627-4482-be63-348b0950f15e";
const CUST = "22222222-3333-4444-8555-666677778888";
const RESOURCE = "44444444-5555-4666-8777-888899990000";

/** Templates that legitimately name no resource, with the reason recorded. */
const SOURCELESS_BY_DESIGN = new Set([
  // Staff-facing digest of a submission; the payload names no resource id.
  "feedback_submitted",
  // Safety warning addressed by vehicle label only, never by resource id.
  "vehicle_safety_critical",
]);

test("every template key has an explicit TEMPLATE_SOURCES decision", () => {
  const undecided = NOTIFICATION_TEMPLATE_KEYS.filter(
    (key) => !(key in TEMPLATE_SOURCES),
  );
  assert.deepEqual(
    undecided,
    [],
    `templates missing a TEMPLATE_SOURCES entry dispatch without an ownership check: ${undecided.join(", ")}`,
  );
});

test("resource-naming templates declare both a table and a payload key", () => {
  for (const key of NOTIFICATION_TEMPLATE_KEYS) {
    const source = TEMPLATE_SOURCES[key];
    if (!source) continue;
    if (SOURCELESS_BY_DESIGN.has(key)) {
      assert.equal(source.table, null, `${key} should declare no source table`);
      assert.equal(source.payloadKey, null, `${key} should declare no payload key`);
      continue;
    }
    assert.ok(source.table, `${key} must name the table its resource lives in`);
    assert.ok(source.payloadKey, `${key} must name the payload key holding the id`);
  }
});

test("each declared payload key survives the persisted-payload allowlist", () => {
  // A payload key that the allowlist strips can never be read back at dispatch,
  // so the ownership check would fail closed on every send.
  for (const key of NOTIFICATION_TEMPLATE_KEYS) {
    const source = TEMPLATE_SOURCES[key];
    if (!source?.payloadKey) continue;
    const parsed = persistablePayloadSchema.safeParse({
      [source.payloadKey]: RESOURCE,
    });
    assert.ok(parsed.success, `${key}: payload failed to parse`);
    assert.equal(
      parsed.data[source.payloadKey],
      RESOURCE,
      `${key}: payload key ${source.payloadKey} is stripped by the allowlist`,
    );
  }
});

test("a resource-naming template is refused when ownership is unproven", () => {
  for (const key of NOTIFICATION_TEMPLATE_KEYS) {
    const source = TEMPLATE_SOURCES[key];
    if (!source?.table) continue;
    const decision = authorizeEventForDispatch({
      event: {
        id: "55555555-6666-4777-8888-999900001111",
        business_id: BIZ,
        customer_id: CUST,
        channel: "email",
        template_key: key,
        payload: { [source.payloadKey]: RESOURCE },
        status: "processing",
      },
      business: { id: BIZ },
      customer: {
        id: CUST,
        business_id: BIZ,
        email: "owner@example.com",
        full_name: "Test Customer",
        preferred_language: "en",
      },
      // The caller could not prove the resource belongs to this business.
      sourceMatches: false,
    });
    assert.equal(
      decision.allowed,
      false,
      `${key} dispatched without proving its resource belongs to the business`,
    );
    assert.equal(decision.code, "source_unverified", `${key}: wrong refusal code`);
  }
});
