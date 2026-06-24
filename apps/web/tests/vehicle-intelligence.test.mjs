import test from "node:test";
import assert from "node:assert/strict";

import { validateVin } from "../src/lib/vehicle-intelligence/vin.js";
import {
  buildFallbackDiagnostic,
  buildFallbackMaintenancePlan,
  buildCustomerExplanation,
  buildAdvisorSummary,
} from "../src/lib/vehicle-intelligence/fallbacks.js";
import {
  classifySafetyRisk,
  enforceSafetyOverrides,
  sanitizeCustomerSelfCheckSteps,
} from "../src/lib/vehicle-intelligence/safety.js";
import {
  interpretDtcCodes,
  validateDtcCodes,
} from "../src/lib/vehicle-intelligence/dtc.js";
import { validateDiagnosticJson } from "../src/lib/vehicle-intelligence/schemas.js";
import { decodeVin } from "../src/lib/vehicle-intelligence/vin.js";
import { callOpenAiJson } from "../src/lib/vehicle-intelligence/openai.js";
import { formatVehicleLabel } from "../src/lib/vehicle-intelligence/labels.js";
import {
  buildGroundedVehicleSearchSummary,
  containsUuid,
  deriveVehicleSearchHints,
  isRecordInDateRange,
  matchesSearchText,
  parseVehicleSearchInput,
} from "../src/lib/vehicle-intelligence/search.js";

test("VIN normalization accepts a valid VIN", () => {
  const result = validateVin("jtebu5jr9j5a12345");
  assert.equal(result.ok, true);
  assert.equal(result.normalized, "JTEBU5JR9J5A12345");
});

test("VIN validation rejects bad lengths", () => {
  const result = validateVin("123");
  assert.equal(result.ok, false);
});

test("critical symptoms trigger stop-driving warnings", () => {
  const result = classifySafetyRisk({
    symptoms: "Brake failure and smoke",
    warningLights: ["Brake warning"],
  });
  assert.equal(result.severity, "critical");
  assert.equal(result.stopDrivingWarning, true);
  assert.equal(result.workshopRequired, true);
  assert.equal(result.quoteDraftEligible, false);
});

test("dangerous self-check steps are removed", () => {
  const steps = sanitizeCustomerSelfCheckSteps(
    [
      "Check dashboard warning lights",
      "Remove the battery terminal",
      "Take a photo",
      "Open the coolant cap",
    ],
    "medium",
  );
  assert.deepEqual(steps, ["Check dashboard warning lights", "Take a photo"]);
});

test("fallback diagnostic validates against the JSON schema", () => {
  const diagnostic = buildFallbackDiagnostic({
    symptoms: "Engine shaking at idle",
    drivingCondition: "At idle",
    severityInput: "medium",
    warningLights: ["Check engine"],
    mileage: 123456,
  });
  const parsed = validateDiagnosticJson(diagnostic);
  assert.equal(parsed.ok, true);
  assert.equal(diagnostic.severity, "high");
  assert.ok(diagnostic.possibleCauses.length > 0);
});

test("DTC validation removes invalid or duplicate codes", () => {
  const codes = validateDtcCodes([" p0300 ", "bad", "P0300", "P0420"]);
  assert.deepEqual(codes, ["P0300", "P0420"]);
});

test("DTC interpretation returns verified safety guidance", () => {
  const result = interpretDtcCodes(["P0300"])[0];
  assert.equal(result.code, "P0300");
  assert.equal(result.workshopRequired, true);
  assert.equal(result.stopDrivingWarning, false);
});

test("post-AI overrides force critical safety handling", () => {
  const diagnostic = buildFallbackDiagnostic({
    symptoms: "Smoke and fuel smell",
    severityInput: "low",
  });
  const assessment = classifySafetyRisk({
    symptoms: "Smoke and fuel smell",
  });
  const enforced = enforceSafetyOverrides(diagnostic, assessment);
  assert.equal(enforced.severity, "critical");
  assert.equal(enforced.stopDrivingWarning, true);
  assert.equal(enforced.safeSelfCheckSteps.length, 0);
});

test("maintenance plans remain schema-backed", () => {
  const diagnostic = buildFallbackDiagnostic({
    symptoms: "Rough idle",
    severityInput: "low",
  });
  const plan = buildFallbackMaintenancePlan({
    diagnosis: diagnostic,
    mileage: 50000,
    vehicle: {
      id: "1",
      business_id: "2",
      customer_id: null,
      make: "Toyota",
      model: "Camry",
      year: 2020,
      plate_number: null,
      vin: null,
      color: null,
      metadata: null,
    },
  });
  assert.ok(plan.items.length > 0);
});

test("customer explanations remain advisory", () => {
  const diagnostic = buildFallbackDiagnostic({
    symptoms: "Rough idle",
    severityInput: "medium",
  });
  const explanation = buildCustomerExplanation(diagnostic);
  assert.match(explanation, /advisory/i);
});

test("advisor summaries include structured operational context", () => {
  const diagnostic = buildFallbackDiagnostic({
    symptoms: "Rough idle",
    severityInput: "medium",
  });
  const summary = buildAdvisorSummary({
    vehicle: {
      id: "1",
      business_id: "2",
      customer_id: null,
      make: "Toyota",
      model: "Camry",
      year: 2020,
      plate_number: null,
      vin: null,
      color: null,
      metadata: null,
    },
    diagnosis: diagnostic,
  });
  assert.match(summary, /Severity:/);
});

test("missing OpenAI key fails safely", async () => {
  const prevKey = process.env.OPENAI_API_KEY;
  const prevFetch = global.fetch;
  delete process.env.OPENAI_API_KEY;
  global.fetch = async () => {
    throw new Error("fetch should not be called when OpenAI is missing");
  };

  try {
    const result = await callOpenAiJson({
      systemPrompt: "system",
      userPrompt: "user",
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /not configured/i);
  } finally {
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
    global.fetch = prevFetch;
  }
});

test("invalid OpenAI JSON fails safely", async () => {
  const prevKey = process.env.OPENAI_API_KEY;
  const prevFetch = global.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: "{not valid json" } }],
    }),
  });

  try {
    const result = await callOpenAiJson({
      systemPrompt: "system",
      userPrompt: "user",
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /unexpected token|json/i);
  } finally {
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
    global.fetch = prevFetch;
  }
});

test("VIN provider outage returns a safe unavailable decode", async () => {
  const prevFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("network down");
  };

  try {
    const result = await decodeVin("1HGCM82633A004352");
    assert.equal(result.status, "unavailable");
    assert.equal(result.valid, true);
    assert.match(result.notes[0] ?? "", /unavailable/i);
  } finally {
    global.fetch = prevFetch;
  }
});

test("vehicle labels prefer readable vehicle attributes over UUIDs", () => {
  assert.equal(
    formatVehicleLabel(
      {
        id: "3ccb6f7c-8bf2-49f7-a65e-e2f4139a23c0",
        make: "Harley Davidson",
        model: "Softail Deluxe",
        year: 2008,
        plate_number: "15400 1",
        vin: "1HD1JRW18KY123456",
      },
      "Vehicle",
      "Unknown vehicle",
    ),
    "Harley Davidson Softail Deluxe · 15400 1 · 2008",
  );
});

test("vehicle labels fall back without exposing raw UUIDs", () => {
  assert.equal(
    formatVehicleLabel(
      {
        id: "3ccb6f7c-8bf2-49f7-a65e-e2f4139a23c0",
        make: null,
        model: null,
        year: null,
        plate_number: null,
        vin: null,
      },
      "Vehicle",
      "Unknown vehicle",
    ),
    "Unknown vehicle",
  );
});

test("vehicle intelligence search input validation clamps unsafe filters", () => {
  const result = parseVehicleSearchInput({
    dateRange: "bad",
    locale: "fr",
    query: "  Find recent P0300 cases  ",
    safety: "critical",
    type: "dtc",
  });
  assert.equal(result.success, false);

  const valid = parseVehicleSearchInput({
    dateRange: "7d",
    locale: "ar",
    query: "  Find recent P0300 cases  ",
    safety: "critical",
    type: "dtc",
  });
  assert.equal(valid.success, true);
  assert.equal(valid.data.query, "Find recent P0300 cases");
});

test("vehicle intelligence search derives operational hints", () => {
  const dtc = deriveVehicleSearchHints("Find recent P0300 cases");
  assert.equal(dtc.type, "dtc");
  assert.equal(dtc.dateRange, "7d");

  const maintenance = deriveVehicleSearchHints("Which cars need maintenance this month?");
  assert.equal(maintenance.type, "maintenance");
  assert.equal(maintenance.dateRange, "this_month");

  const safety = deriveVehicleSearchHints("Summarize safety-critical reports this week");
  assert.equal(safety.safety, "stop_driving");
});

test("vehicle intelligence search matching ignores operational stop words", () => {
  assert.equal(
    matchesSearchText(["Toyota Land Cruiser", "overheating at idle", "Ahmed"], "Show vehicles with overheating symptoms"),
    true,
  );
  assert.equal(matchesSearchText(["P0300 random misfire"], "Find recent P0300 cases"), true);
});

test("vehicle intelligence date ranges support current and future service windows", () => {
  const now = new Date("2026-06-23T12:00:00Z");
  assert.equal(isRecordInDateRange("2026-06-10", "this_month", now), true);
  assert.equal(isRecordInDateRange("2026-07-10", "this_month", now), false);
  assert.equal(isRecordInDateRange("2026-07-05", "next_30d", now), true);
});

test("grounded vehicle search summary refuses unsupported unsafe repair instructions", () => {
  const result = buildGroundedVehicleSearchSummary({
    query: "How do I bypass the brake warning and drive anyway?",
    results: [
      {
        sourceMarker: "diagnostic-1",
        stopDrivingWarning: true,
        safetyLevel: "critical",
        title: "Brake warning diagnostic",
        type: "diagnostics",
      },
    ],
  });
  assert.equal(result.safetyWarning, true);
  assert.match(result.text, /will not provide instructions/i);
});

test("grounded vehicle search summary reports insufficient data without hallucinated specs", () => {
  const result = buildGroundedVehicleSearchSummary({
    query: "What engine does this VIN have?",
    results: [],
  });
  assert.equal(result.dataInsufficient, true);
  assert.match(result.text, /not enough internal record data/i);
  assert.doesNotMatch(result.text, /V6|V8|turbo/i);
});

test("grounded vehicle search summary does not expose raw UUIDs", () => {
  const result = buildGroundedVehicleSearchSummary({
    query: "Find record",
    results: [
      {
        sourceMarker: "vehicle-1",
        stopDrivingWarning: false,
        safetyLevel: null,
        title: "3ccb6f7c-8bf2-49f7-a65e-e2f4139a23c0",
        type: "vehicles",
      },
    ],
  });
  assert.equal(containsUuid(result.text), false);
});
