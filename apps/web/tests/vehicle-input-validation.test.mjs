import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// APPSEC-09 Phase 3 — vehicle dashboard mutation validation. Structure only:
// these tests also pin the deliberate boundary that Revora never invents or
// enriches vehicle specifications during validation.

import {
  createVehicleSchema,
  updateVehicleSchema,
  MIN_VEHICLE_YEAR,
  maxVehicleYear,
} from "../src/lib/validation/vehicles.js";

const UID = "c883e981-3627-4482-be63-348b0950f15e";
const UID2 = "11111111-2222-4333-8444-555566667777";
const ok = (r) => r.success === true;

// --- create / update payloads ----------------------------------------------

test("vehicles: valid payload accepted and normalized", () => {
  const r = createVehicleSchema.safeParse({
    customerId: UID,
    make: "  Toyota  ",
    model: "Land Cruiser",
    year: "2021",
    plateNumber: "A 12345",
    vin: "JTMHV05J104123456",
    color: "White",
  });
  assert.equal(ok(r), true);
  assert.equal(r.data.make, "Toyota"); // trimmed
  assert.equal(r.data.year, 2021); // parsed to a number
});

test("vehicles: Arabic and Unicode free text accepted", () => {
  const r = createVehicleSchema.safeParse({
    customerId: UID,
    make: "تويوتا",
    model: "لاند كروزر",
    color: "أبيض",
    plateNumber: "أ ١٢٣٤٥",
  });
  assert.equal(ok(r), true);
  assert.equal(r.data.make, "تويوتا");
  assert.equal(r.data.plateNumber, "أ ١٢٣٤٥"); // regional plate format preserved
});

test("vehicles: malformed vehicle/customer ids rejected", () => {
  assert.equal(ok(createVehicleSchema.safeParse({ customerId: "x" })), false);
  assert.equal(ok(createVehicleSchema.safeParse({ customerId: "" })), false);
  assert.equal(ok(updateVehicleSchema.safeParse({ id: "x", customerId: UID })), false);
  assert.equal(ok(updateVehicleSchema.safeParse({ id: UID, customerId: "x" })), false);
});

test("vehicles: update customer selector is optional (falls back server-side)", () => {
  const r = updateVehicleSchema.safeParse({ id: UID, customerId: "" });
  assert.equal(ok(r), true);
  assert.equal(r.data.customerId, undefined);
  assert.equal(ok(updateVehicleSchema.safeParse({ id: UID, customerId: UID2 })), true);
});

// --- year -------------------------------------------------------------------

test("vehicles: year keeps the existing supported range, rejects garbage", () => {
  const max = maxVehicleYear();
  for (const good of [String(MIN_VEHICLE_YEAR), "2020", String(max)]) {
    assert.equal(
      ok(createVehicleSchema.safeParse({ customerId: UID, year: good })),
      true,
      `${good} should be accepted`,
    );
  }
  for (const bad of ["1899", String(max + 1), "abc", "20.5", "1e999", "-2020"]) {
    assert.equal(
      ok(createVehicleSchema.safeParse({ customerId: UID, year: bad })),
      false,
      `${bad} should be rejected`,
    );
  }
});

test("vehicles: blank year clears the field rather than defaulting", () => {
  const r = createVehicleSchema.safeParse({ customerId: UID, year: "" });
  assert.equal(ok(r), true);
  assert.equal(r.data.year, undefined); // action persists null
});

// --- no specification enrichment -------------------------------------------

test("vehicles: VIN is stored verbatim — never decoded, enriched, or reformatted", () => {
  const vin = "jtmhv05j104123456"; // lowercase, unusual but storable today
  const r = createVehicleSchema.safeParse({ customerId: UID, vin });
  assert.equal(ok(r), true);
  assert.equal(r.data.vin, vin); // case and characters untouched
  // Nothing is inferred from the VIN: make/model/year stay absent.
  assert.equal(r.data.make, undefined);
  assert.equal(r.data.model, undefined);
  assert.equal(r.data.year, undefined);
  // A short/non-standard VIN is still accepted (no format rule exists today).
  assert.equal(ok(createVehicleSchema.safeParse({ customerId: UID, vin: "TEMP-123" })), true);
  // Only an abusive length is refused.
  assert.equal(
    ok(createVehicleSchema.safeParse({ customerId: UID, vin: "V".repeat(500) })),
    false,
  );
});

// --- security ---------------------------------------------------------------

test("vehicles: client-supplied tenant identity is stripped by the schema", () => {
  const r = createVehicleSchema.safeParse({
    customerId: UID,
    business_id: "11111111-1111-4111-8111-111111111111",
    businessId: "22222222-2222-4222-8222-222222222222",
  });
  assert.equal(ok(r), true);
  assert.equal("business_id" in r.data, false);
  assert.equal("businessId" in r.data, false);
});

// --- static regressions -----------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const actions = readFileSync(
  path.resolve(here, "../src/app/[locale]/(dashboard)/vehicles/actions.ts"),
  "utf8",
);

test("security: vehicle actions validate, scope by session, and verify customer ownership", () => {
  assert.match(actions, /createVehicleSchema\.safeParse\(/);
  assert.match(actions, /updateVehicleSchema\.safeParse\(/);
  assert.match(actions, /firstValidationMessage\(/);
  // Ownership of the linked customer is confirmed against the session business
  // before the id is written.
  assert.match(actions, /validateCustomer\(business\.id,/);
  assert.match(actions, /customer_id:\s*confirmedCustomerId/);
  assert.match(actions, /business_id:\s*business\.id/);
  assert.match(actions, /\.eq\("business_id",\s*business\.id\)/);
  // No external VIN/spec enrichment in the mutation path.
  assert.doesNotMatch(actions, /decodeVin|vehicle-intelligence|fetch\(/);
});
