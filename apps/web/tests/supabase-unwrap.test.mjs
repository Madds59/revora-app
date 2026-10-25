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

// --- the auth core -------------------------------------------------------
//
// unwrapRows existing is not the same as the auth core using it. These three
// reads were the last places where a query failure was still folded into
// absence, and they are the worst place for it: getCurrentMembership returning
// null makes requireMembership() redirect an ONBOARDED owner to /onboarding,
// and getCurrentCustomerAccounts returning [] shows a portal customer an empty
// portal. `audit:discards` cannot see them -- its detector skips any line
// mentioning `error`, so binding the error satisfies it even when the handling
// throws the failure away.
//
// This is a SOURCE-SHAPE guard, not a behavioural one: auth.ts is TypeScript
// importing next/navigation through the `@/` alias, so `node --test` cannot
// load it. It asserts the shape is gone and the helper is used; it does not
// execute the functions.

import { readFileSync } from "node:fs";

const AUTH_SRC = readFileSync(
  new URL("../src/lib/auth.ts", import.meta.url),
  "utf8",
);

/** `if (error ...) return <absence>` -- a failure answered as "no data". */
const COLLAPSE = /if\s*\(\s*error[^)]*\)\s*return\s*(\[\]|null|0)\s*;/;

test("the collapse detector can actually fail (positive control)", () => {
  // Without this, a detector that matched nothing would pass vacuously.
  assert.match("  if (error || !data) return [];", COLLAPSE);
  assert.match("    if (error || !data || data.length === 0) return null;", COLLAPSE);
  // And it must stay quiet about a result that reports its error.
  assert.doesNotMatch("  if (error) return { error: error.message };", COLLAPSE);
});

test("no read in the auth core answers a failed query with absence", () => {
  const offenders = AUTH_SRC.split("\n")
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => COLLAPSE.test(line));
  assert.deepEqual(
    offenders,
    [],
    `auth.ts folds a query failure into absence at line(s) ${offenders
      .map(([n]) => n)
      .join(", ")}`,
  );
});

test("each auth core read goes through an unwrap helper with a named section", () => {
  for (const section of [
    "auth.currentMembership",
    "auth.currentMemberships",
    "auth.currentCustomerAccounts",
  ]) {
    assert.ok(
      AUTH_SRC.includes(`"${section}"`),
      `expected an unwrapped read labelled ${section}`,
    );
  }
  assert.match(AUTH_SRC, /import \{ unwrapRow, unwrapRows \} from "@\/lib\/supabase\/unwrap\.js";/);
});
