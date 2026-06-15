import test from "node:test";
import assert from "node:assert/strict";

import { calculateRetainer } from "../src/lib/retainer/calculate-retainer.js";
import { buildRetainerQuoteLine, buildRetainerQuoteNotes } from "../src/lib/retainer/quote.js";
import { canUseRetainerCalculator } from "../src/lib/retainer/access.js";

const baseInput = {
  currency: "AED",
  billingCycle: "monthly",
  contractLengthMonths: 12,
  numberOfVehicles: 12,
  expectedMonthlyVisits: 24,
  slaLevel: "priority",
  laborItems: [
    {
      id: "labor-1",
      role: "Technician",
      department: "Workshop",
      hourlyCost: 90,
      estimatedHours: 40,
      utilization: 0.8,
    },
  ],
  partsItems: [
    {
      id: "parts-1",
      name: "Consumables",
      unitCost: 120,
      quantity: 6,
      markup: 0.25,
    },
  ],
  toolItems: [
    {
      id: "tool-1",
      name: "Scan tool",
      monthlyCost: 450,
      allocation: 0.35,
    },
  ],
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
    annualPrepayDiscount: 0.05,
  },
};

const scenario = {
  id: "11111111-1111-1111-1111-111111111111",
  businessId: "22222222-2222-2222-2222-222222222222",
  quoteId: null,
  createdBy: "33333333-3333-3333-3333-333333333333",
  title: "Fleet maintenance retainer",
  description: "Monthly retainer pricing draft.",
  customerId: "44444444-4444-4444-4444-444444444444",
  customerType: "fleet",
  serviceCategory: "fleet_maintenance",
  input: baseInput,
  status: "draft",
  calculatedResults: calculateRetainer(baseInput),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("retainer calculator computes a viable monthly retainer", () => {
  const result = calculateRetainer(baseInput);
  assert.equal(result.ok, true);
  assert.ok(result.finalMonthlyRetainer > 0);
  assert.ok(result.warnings.some((warning) => warning.code === "fleet_tier"));
  assert.ok(result.recommendations.some((recommendation) => recommendation.code === "viable"));
});

test("retainer quote helper preserves scenario-to-quote math", () => {
  const line = buildRetainerQuoteLine(scenario, scenario.businessId, "55555555-5555-5555-5555-555555555555");
  const notes = buildRetainerQuoteNotes(scenario);
  const expectedTotal =
    line.quantity * line.unit_price * (1 + line.tax_rate / 100);

  assert.equal(line.business_id, scenario.businessId);
  assert.equal(line.kind, "service");
  assert.equal(line.quantity, scenario.input.contractLengthMonths);
  assert.ok(Math.abs(line.total - expectedTotal) < 1e-9);
  assert.match(notes.customer_notes, /Fleet maintenance retainer/);
  assert.match(notes.internal_notes, /Scenario: Fleet maintenance retainer/);
  assert.match(notes.warranty_terms, /converted from/);
});

test("retainer pricing access stays owner/admin-only", () => {
  assert.equal(canUseRetainerCalculator("business_owner"), true);
  assert.equal(canUseRetainerCalculator("manager"), true);
  assert.equal(canUseRetainerCalculator("employee"), false);
  assert.equal(canUseRetainerCalculator("customer"), false);
  assert.equal(canUseRetainerCalculator("super_admin"), false);
});
