import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PHASE_1_DEFAULTS, resolveFeatures } from "../src/lib/features/flags.js";
import {
  DASHBOARD_NAV,
  PORTAL_NAV,
  isNavItemActive,
  visibleGroups,
} from "../src/lib/nav/model.js";

const ALL_ALLOWED = { pricingTools: true };
const NO_PRICING = { pricingTools: false };
const phase1 = { features: PHASE_1_DEFAULTS, permissions: ALL_ALLOWED };

const countItems = (groups) =>
  groups.reduce((total, group) => total + group.items.length, 0);

test("phase 1 dashboard nav is 14 items in 4 groups", () => {
  const groups = visibleGroups(DASHBOARD_NAV, phase1);
  assert.equal(groups.length, 4);
  assert.equal(countItems(groups), 14);
});

test("phase 1 portal nav is 10 items in 4 groups", () => {
  const groups = visibleGroups(PORTAL_NAV, phase1);
  assert.equal(groups.length, 4);
  assert.equal(countItems(groups), 10);
});

test("home and inspections lead both sidebars, ungrouped", () => {
  const [dashLead] = visibleGroups(DASHBOARD_NAV, phase1);
  assert.equal(dashLead.labelKey, undefined);
  assert.deepEqual(
    dashLead.items.map((i) => i.labelKey),
    ["dashboard", "inspections"],
  );

  const [portalLead] = visibleGroups(PORTAL_NAV, phase1);
  assert.equal(portalLead.labelKey, undefined);
  assert.deepEqual(
    portalLead.items.map((i) => i.labelKey),
    ["home", "inspections"],
  );
});

test("a group whose items are all filtered is dropped, not rendered empty", () => {
  const groups = visibleGroups(DASHBOARD_NAV, phase1);
  assert.equal(
    groups.some((group) => group.labelKey === "tools"),
    false,
  );
  assert.equal(
    groups.every((group) => group.items.length > 0),
    true,
  );
});

test("enabling a feature restores exactly its items", () => {
  const groups = visibleGroups(DASHBOARD_NAV, {
    features: resolveFeatures("analytics"),
    permissions: ALL_ALLOWED,
  });
  assert.equal(countItems(groups), 15);
  const tools = groups.find((group) => group.labelKey === "tools");
  assert.deepEqual(
    tools.items.map((i) => i.labelKey),
    ["analytics"],
  );
});

test("permission filtering is independent of the feature flag", () => {
  // Feature ON, permission OFF -> still hidden. This is the regression that
  // would silently grant every manager the pricing tools in phase 2.
  const groups = visibleGroups(DASHBOARD_NAV, {
    features: resolveFeatures("retainerCalculator,membershipBundles"),
    permissions: NO_PRICING,
  });
  assert.equal(countItems(groups), 14);
  assert.equal(
    groups.some((group) => group.labelKey === "tools"),
    false,
  );

  const allowed = visibleGroups(DASHBOARD_NAV, {
    features: resolveFeatures("retainerCalculator,membershipBundles"),
    permissions: ALL_ALLOWED,
  });
  assert.equal(countItems(allowed), 16);
});

test("visibleGroups does not mutate the source model", () => {
  const before = JSON.stringify(DASHBOARD_NAV);
  visibleGroups(DASHBOARD_NAV, phase1);
  assert.equal(JSON.stringify(DASHBOARD_NAV), before);
});

test("isNavItemActive matches the item, its children and its aliases", () => {
  const quotes = { labelKey: "quotes", href: "/quotes", icon: "FileText", aliases: ["/quotations"] };
  assert.equal(isNavItemActive("/quotes", quotes), true);
  assert.equal(isNavItemActive("/quotes/abc", quotes), true);
  assert.equal(isNavItemActive("/quotations/abc", quotes), true);
  assert.equal(isNavItemActive("/quotes-archive", quotes), false);

  const dashboard = { labelKey: "dashboard", href: "/dashboard", icon: "Home", aliases: ["/"] };
  assert.equal(isNavItemActive("/", dashboard), true);
  assert.equal(isNavItemActive("/customers", dashboard), false);

  const portalHome = { labelKey: "home", href: "/portal", icon: "Home", exact: true };
  assert.equal(isNavItemActive("/portal", portalHome), true);
  assert.equal(isNavItemActive("/portal/jobs", portalHome), false);
});

test("every label key in both models resolves in en.json and ar.json", () => {
  // Resolve relative to this file, not the cwd, so the test survives being run
  // from the repo root as well as from apps/web.
  const load = (locale) =>
    JSON.parse(
      readFileSync(new URL(`../src/messages/${locale}.json`, import.meta.url), "utf8"),
    );
  const en = load("en");
  const ar = load("ar");

  for (const groups of [DASHBOARD_NAV, PORTAL_NAV]) {
    for (const group of groups) {
      if (group.labelKey) {
        assert.ok(en.nav.group[group.labelKey], `en nav.group.${group.labelKey}`);
        assert.ok(ar.nav.group[group.labelKey], `ar nav.group.${group.labelKey}`);
      }
      for (const item of group.items) {
        assert.ok(en.nav[item.labelKey], `en nav.${item.labelKey}`);
        assert.ok(ar.nav[item.labelKey], `ar nav.${item.labelKey}`);
      }
    }
  }
  assert.deepEqual(Object.keys(en.nav.group).sort(), Object.keys(ar.nav.group).sort());
});
