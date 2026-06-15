import test from "node:test";
import assert from "node:assert/strict";

import { calculateRetainer } from "../src/lib/retainer/calculate-retainer.js";
import { buildBundlesFromScenario } from "../src/lib/bundles/generate.js";

const baseInput = {
  currency: "AED",
  billingCycle: "monthly",
  contractLengthMonths: 12,
  numberOfVehicles: 10,
  expectedMonthlyVisits: 20,
  slaLevel: "priority",
  laborItems: [
    { id: "l1", role: "Technician", hourlyCost: 90, estimatedHours: 40, utilization: 0.8 },
  ],
  partsItems: [{ id: "p1", name: "Consumables", unitCost: 120, quantity: 6, markup: 0.25 }],
  toolItems: [{ id: "t1", name: "Scan tool", monthlyCost: 450, allocation: 0.35 }],
  overhead: {
    rent: 3000,
    utilities: 850,
    equipmentDepreciation: 1200,
    insurance: 650,
    adminOverhead: 2400,
    miscellaneous: 500,
  },
  risk: {
    reworkBuffer: 0.05,
    emergencySupportBuffer: 0.04,
    prioritySlaPremium: 0.05,
    warrantyReserve: 0.03,
    latePaymentRisk: 0.02,
  },
  pricing: {
    targetMargin: 0.35,
    minimumMargin: 0.25,
    discount: 0.03,
    vat: 0.05,
    rounding: "nearest_50",
  },
};

const scenario = {
  id: "11111111-1111-1111-1111-111111111111",
  businessId: "22222222-2222-2222-2222-222222222222",
  quoteId: null,
  createdBy: "33333333-3333-3333-3333-333333333333",
  title: "Fleet care",
  description: "Monthly fleet retainer",
  customerId: null,
  customerType: "fleet",
  serviceCategory: "fleet_maintenance",
  input: baseInput,
  status: "draft",
  calculatedResults: calculateRetainer(baseInput),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("membership bundles derive Essential/Growth/Premium from a scenario", () => {
  const bundles = buildBundlesFromScenario(scenario);
  assert.equal(bundles.length, 3);
  assert.deepEqual(
    bundles.map((b) => b.tier),
    ["essential", "growth", "premium"],
  );
  for (const bundle of bundles) {
    assert.ok(bundle.price > 0);
    assert.equal(bundle.currency, "AED");
    assert.equal(bundle.isPublished, false);
    assert.equal(bundle.scenarioId, scenario.id);
    assert.match(bundle.name, /Fleet care/);
  }
  assert.deepEqual(
    bundles.map((b) => b.sortOrder),
    [0, 1, 2],
  );
  // Premium (vip + higher margin) costs at least as much as Essential.
  assert.ok(bundles[2].price >= bundles[0].price);
  // Premium upgrades the SLA.
  assert.equal(bundles[2].slaLevel, "vip");
});
