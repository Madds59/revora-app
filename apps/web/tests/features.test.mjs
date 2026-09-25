import test from "node:test";
import assert from "node:assert/strict";

import {
  FEATURE_KEYS,
  PHASE_1_DEFAULTS,
  isFeatureEnabled,
  isFeatureKey,
  parseFeatureOverrides,
  resolveFeatures,
} from "../src/lib/features/flags.js";

test("every phase 1 optional module defaults to off", () => {
  assert.deepEqual(PHASE_1_DEFAULTS, {
    vehicleIntelligence: false,
    retainerCalculator: false,
    membershipBundles: false,
    analytics: false,
    maintenance: false,
    feedback: false,
  });
  assert.equal(FEATURE_KEYS.length, 6);
});

test("an unset or blank override leaves the defaults untouched", () => {
  assert.deepEqual(resolveFeatures(undefined), PHASE_1_DEFAULTS);
  assert.deepEqual(resolveFeatures(null), PHASE_1_DEFAULTS);
  assert.deepEqual(resolveFeatures(""), PHASE_1_DEFAULTS);
  assert.deepEqual(resolveFeatures("   "), PHASE_1_DEFAULTS);
});

test("the override enables exactly the keys it names", () => {
  const flags = resolveFeatures("analytics,maintenance");
  assert.equal(flags.analytics, true);
  assert.equal(flags.maintenance, true);
  assert.equal(flags.vehicleIntelligence, false);
  assert.equal(flags.retainerCalculator, false);
});

test("malformed override entries are ignored rather than thrown on", () => {
  // Stray commas, padding, unknown names, wrong casing, non-string input.
  assert.deepEqual(parseFeatureOverrides(",, ,"), []);
  assert.deepEqual(parseFeatureOverrides("  analytics  ,, maintenance "), [
    "analytics",
    "maintenance",
  ]);
  assert.deepEqual(parseFeatureOverrides("Analytics"), []);
  assert.deepEqual(parseFeatureOverrides("nope,analytics"), ["analytics"]);
  assert.deepEqual(parseFeatureOverrides("__proto__"), []);
  assert.deepEqual(parseFeatureOverrides(42), []);
  assert.deepEqual(parseFeatureOverrides({}), []);
});

test("an unknown key never becomes an enabled flag", () => {
  const flags = resolveFeatures("nope,__proto__,constructor");
  assert.deepEqual(flags, PHASE_1_DEFAULTS);
  assert.equal(Object.keys(flags).length, 6);
});

test("isFeatureKey accepts only the six registry names", () => {
  assert.equal(isFeatureKey("analytics"), true);
  assert.equal(isFeatureKey("nope"), false);
  assert.equal(isFeatureKey(""), false);
  assert.equal(isFeatureKey(undefined), false);
  assert.equal(isFeatureKey("<script>alert(1)</script>"), false);
});

test("an ungated item (no feature key) is always enabled", () => {
  assert.equal(isFeatureEnabled(PHASE_1_DEFAULTS, undefined), true);
  assert.equal(isFeatureEnabled(PHASE_1_DEFAULTS, "analytics"), false);
  assert.equal(isFeatureEnabled(resolveFeatures("analytics"), "analytics"), true);
});

test("resolveFeatures returns a fresh object each call", () => {
  const a = resolveFeatures("analytics");
  const b = resolveFeatures(undefined);
  assert.equal(a.analytics, true);
  assert.equal(b.analytics, false);
});
