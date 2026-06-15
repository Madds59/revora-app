import test from "node:test";
import assert from "node:assert/strict";

import { switchLocalePath } from "../src/lib/locale-path.js";

test("switchLocalePath replaces an existing locale segment", () => {
  assert.equal(
    switchLocalePath("/ar/tools/membership-bundles", "en"),
    "/en/tools/membership-bundles",
  );
  assert.equal(
    switchLocalePath("/en/tools/membership-bundles", "ar"),
    "/ar/tools/membership-bundles",
  );
  assert.equal(
    switchLocalePath("/ar/portal/memberships", "en"),
    "/en/portal/memberships",
  );
  assert.equal(
    switchLocalePath("/en/portal/memberships", "ar"),
    "/ar/portal/memberships",
  );
});

test("switchLocalePath prefixes non-localized paths", () => {
  assert.equal(switchLocalePath("/en/vehicles/123", "ar"), "/ar/vehicles/123");
  assert.equal(switchLocalePath("/vehicles/123", "en"), "/en/vehicles/123");
  assert.equal(switchLocalePath("/", "ar"), "/ar");
});

test("switchLocalePath never stacks locales", () => {
  const cases = [
    switchLocalePath("/ar/tools/membership-bundles", "en"),
    switchLocalePath("/en/tools/membership-bundles", "ar"),
    switchLocalePath("/ar/portal/memberships", "en"),
    switchLocalePath("/en/portal/memberships", "ar"),
  ];

  for (const href of cases) {
    assert.equal(href.includes("/ar/en/"), false);
    assert.equal(href.includes("/en/ar/"), false);
  }
});
