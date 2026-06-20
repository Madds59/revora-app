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

test("switchLocalePath normalizes quote redirects with duplicate locale segments", () => {
  assert.equal(
    switchLocalePath("/ar/ar/portal/quotes", "en"),
    "/en/portal/quotes",
  );
  assert.equal(
    switchLocalePath("/en/en/portal/quotes?quote_status=approved", "ar"),
    "/ar/portal/quotes?quote_status=approved",
  );
});

test("switchLocalePath handles dashboard nav paths", () => {
  assert.equal(switchLocalePath("/jobs", "en"), "/en/jobs");
  assert.equal(switchLocalePath("/vehicles", "ar"), "/ar/vehicles");
  assert.equal(switchLocalePath("/admin/notifications", "en"), "/en/admin/notifications");
});

test("switchLocalePath handles portal nav paths", () => {
  assert.equal(switchLocalePath("/portal/quotes", "ar"), "/ar/portal/quotes");
  assert.equal(switchLocalePath("/portal/memberships", "en"), "/en/portal/memberships");
});

test("switchLocalePath never stacks locales", () => {
  const cases = [
    switchLocalePath("/ar/tools/membership-bundles", "en"),
    switchLocalePath("/en/tools/membership-bundles", "ar"),
    switchLocalePath("/ar/portal/memberships", "en"),
    switchLocalePath("/en/portal/memberships", "ar"),
    switchLocalePath("/ar/en/jobs", "ar"),
    switchLocalePath("/ar/en/jobs", "en"),
    switchLocalePath("/en/ar/jobs", "ar"),
    switchLocalePath("/en/ar/jobs", "en"),
    switchLocalePath("/ar/en/jobs?tab=open#top", "en"),
  ];

  for (const href of cases) {
    assert.equal(href.includes("/ar/en/"), false);
    assert.equal(href.includes("/en/ar/"), false);
    assert.equal(href.includes("/ar/ar/"), false);
    assert.equal(href.includes("/en/en/"), false);
  }
});

test("switchLocalePath preserves query and hash fragments", () => {
  assert.equal(
    switchLocalePath("/ar/jobs?status=open#top", "en"),
    "/en/jobs?status=open#top",
  );
  assert.equal(
    switchLocalePath("/jobs?status=open#top", "ar"),
    "/ar/jobs?status=open#top",
  );
});
