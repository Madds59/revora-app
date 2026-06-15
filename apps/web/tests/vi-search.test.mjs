import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVehicleIntelligenceSearchResult,
  enrichVehicleIntelligenceSearchResult,
} from "../src/lib/vehicle-intelligence/search.js";

test("routeVehicleIntelligenceQuery routes safety-critical symptoms to diagnosis", () => {
  const result = buildVehicleIntelligenceSearchResult("smoke and fuel smell");
  assert.ok(result);
  assert.equal(result.tool, "diagnosis");
  assert.equal(result.route, "/ai/vehicle-diagnosis");
  assert.equal(result.safety.stopDrivingWarning, true);
  assert.deepEqual(result.requiredInputs, ["vehicle", "symptoms", "warningLights", "drivingCondition", "mileage"]);
});

test("routeVehicleIntelligenceQuery routes VIN queries to the VIN decoder", () => {
  const result = buildVehicleIntelligenceSearchResult("decode VIN JTEBU5JR9J5A12345");
  assert.ok(result);
  assert.equal(result.tool, "vin");
  assert.equal(result.route, "/ai/vin-decoder");
  assert.deepEqual(result.requiredInputs, ["vehicle", "vin"]);
  assert.equal(result.safety.stopDrivingWarning, false);
});

test("routeVehicleIntelligenceQuery routes code queries to the DTC decoder", () => {
  const result = buildVehicleIntelligenceSearchResult("P0300 check engine");
  assert.ok(result);
  assert.equal(result.tool, "dtc");
  assert.equal(result.route, "/ai/dtc-decoder");
  assert.deepEqual(result.requiredInputs, ["vehicle", "codes"]);
});

test("routeVehicleIntelligenceQuery returns null for empty queries", () => {
  assert.equal(buildVehicleIntelligenceSearchResult("   "), null);
});

test("enrichVehicleIntelligenceSearchResult safely no-ops without OpenAI", async () => {
  const baseResult = buildVehicleIntelligenceSearchResult("decode VIN JTEBU5JR9J5A12345");
  assert.ok(baseResult);

  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "";

  try {
    const enriched = await enrichVehicleIntelligenceSearchResult({
      baseResult,
      locale: "en",
    });

    assert.ok(enriched);
    assert.equal(enriched.aiUsed, false);
    assert.equal(enriched.assistantSummary, null);
    assert.equal(enriched.route, baseResult.route);
  } finally {
    if (previousKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousKey;
    }
  }
});
