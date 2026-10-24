import assert from "node:assert/strict";
import test from "node:test";

// Regression guard for the PGRST201 outage.
//
// The inspections start page read `const { data } = await supabase...` and fed
// `data ?? []` straight into an empty state, so an HTTP 300 ambiguous-embed
// failure rendered as "Add a vehicle for this customer first." on a business
// that had three vehicles. The query error was discarded, nothing was logged,
// and the screen accused the user of having no data.
//
// unwrapRows exists so that cannot be written by accident: a failed result
// raises and the route's error.tsx boundary renders.

import {
  SupabaseQueryError,
  unwrapCount,
  unwrapRow,
  unwrapRows,
} from "../src/lib/supabase/unwrap.js";

/** The exact shape postgrest-js returns for an ambiguous embed. */
const AMBIGUOUS_EMBED = {
  data: null,
  error: {
    code: "PGRST201",
    message: "Could not embed because more than one relationship was found for 'vehicles' and 'customers'",
    details: [{ relationship: "vehicles_customer_id_fkey" }],
    hint: "Try changing 'customers' to one of the following: 'customers!vehicles_customer_id_fkey'",
  },
};

test("a failed list query raises instead of reading as empty", () => {
  assert.throws(
    () => unwrapRows(AMBIGUOUS_EMBED, "inspections.vehicles"),
    SupabaseQueryError,
  );
});

test("the raised error carries the code and section a report needs", () => {
  try {
    unwrapRows(AMBIGUOUS_EMBED, "inspections.vehicles");
    assert.fail("expected unwrapRows to throw");
  } catch (err) {
    assert.ok(err instanceof SupabaseQueryError);
    assert.equal(err.code, "PGRST201");
    assert.equal(err.section, "inspections.vehicles");
    assert.match(err.message, /inspections\.vehicles/);
    assert.match(err.message, /\[PGRST201\]/);
  }
});

test("a genuinely empty result is still an empty array", () => {
  assert.deepEqual(unwrapRows({ data: [], error: null }), []);
  // PostgREST can answer null rather than [] for an empty set.
  assert.deepEqual(unwrapRows({ data: null, error: null }), []);
});

test("rows pass through untouched", () => {
  const rows = [{ id: "a" }, { id: "b" }];
  assert.equal(unwrapRows({ data: rows, error: null }), rows);
});

test("unwrapRow raises on error but passes a legitimate null through", () => {
  assert.throws(() => unwrapRow(AMBIGUOUS_EMBED, "jobs.vehicle"), SupabaseQueryError);
  assert.equal(unwrapRow({ data: null, error: null }), null);
  assert.deepEqual(unwrapRow({ data: { id: "a" }, error: null }), { id: "a" });
});

test("an error with no message still raises rather than returning empty", () => {
  assert.throws(() => unwrapRows({ data: null, error: {} }), SupabaseQueryError);
});

test("a failed count raises instead of reading as zero", () => {
  // The complaints list rendered `count ?? 0`, so a failed count was a
  // confident "0 open complaints" for a query that never ran.
  assert.throws(() => unwrapCount(AMBIGUOUS_EMBED, "complaints.openCount"), SupabaseQueryError);
});

test("a genuinely zero count is still zero", () => {
  assert.equal(unwrapCount({ count: 0, data: null }, "complaints.openCount"), 0);
});

test("a real count passes through", () => {
  assert.equal(unwrapCount({ count: 7, data: null }, "complaints.openCount"), 7);
});

test("a conditional query's `{ data: [] }` fallback carries no error and is not one", () => {
  // `cond ? await supabase... : { data: [] }` is a legitimate shape; the
  // literal branch has no error key at all.
  assert.deepEqual(unwrapRows({ data: [] }, "portal.vehicles"), []);
  assert.equal(unwrapRow({ data: null }, "portal.vehicles"), null);
});
