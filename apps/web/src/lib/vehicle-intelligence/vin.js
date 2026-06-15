import { validateVinDecode } from "./schemas.js";

const VIN_API_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended";

function normalizeVin(vin) {
  return String(vin ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function validateVin(vin) {
  const normalized = normalizeVin(vin);
  if (normalized.length !== 17) {
    return { ok: false, normalized, error: "VIN must be exactly 17 characters." };
  }
  if (/[IOQ]/.test(normalized)) {
    return { ok: false, normalized, error: "VIN may not contain I, O, or Q." };
  }
  return { ok: true, normalized };
}

function pick(rows, key) {
  return rows.find((row) => row.Variable === key)?.Value ?? null;
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const num = Number.parseInt(String(value), 10);
  return Number.isFinite(num) ? num : null;
}

function toDecodeResult(vin, notes, rows) {
  const decoded = {
    vin,
    valid: true,
    status: "decoded",
    decodeSource: "nhtsa",
    make: pick(rows, "Make"),
    model: pick(rows, "Model"),
    year: toNumber(pick(rows, "Model Year")),
    trim: pick(rows, "Trim"),
    bodyClass: pick(rows, "Body Class"),
    engine: pick(rows, "Engine Model"),
    fuelType: pick(rows, "Fuel Type - Primary"),
    driveType: pick(rows, "Drive Type"),
    transmission: pick(rows, "Transmission Style"),
    plantCountry: pick(rows, "Plant Country"),
    plantState: pick(rows, "Plant State"),
    plantCity: pick(rows, "Plant City"),
    manufacturer: pick(rows, "Manufacturer Name"),
    raw: Object.fromEntries(
      rows.map((row) => [row.Variable, row.Value ?? null]),
    ),
    notes,
  };

  const parsed = validateVinDecode(decoded);
  return parsed.ok ? parsed.data : decoded;
}

export async function decodeVin(vin) {
  const validation = validateVin(vin);
  if (!validation.ok) {
    return {
      vin: validation.normalized,
      valid: false,
      status: "invalid",
      decodeSource: "unknown",
      make: null,
      model: null,
      year: null,
      trim: null,
      bodyClass: null,
      engine: null,
      fuelType: null,
      driveType: null,
      transmission: null,
      plantCountry: null,
      plantState: null,
      plantCity: null,
      manufacturer: null,
      raw: {},
      notes: [validation.error],
    };
  }

  try {
    const response = await fetch(`${VIN_API_URL}/${validation.normalized}?format=json`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        vin: validation.normalized,
        valid: true,
        status: "unavailable",
        decodeSource: "nhtsa",
        make: null,
        model: null,
        year: null,
        trim: null,
        bodyClass: null,
        engine: null,
        fuelType: null,
        driveType: null,
        transmission: null,
        plantCountry: null,
        plantState: null,
        plantCity: null,
        manufacturer: null,
        raw: {},
        notes: ["VIN decoder service returned an error."],
      };
    }

    const payload = await response.json();
    const rows = Array.isArray(payload?.Results) ? payload.Results : [];
    const notes = [];
    const errorCode = String(pick(rows, "Error Code") ?? "").trim();
    const errorText = String(pick(rows, "Error Text") ?? "").trim();
    if (errorCode && errorCode !== "0") {
      notes.push(errorText || "VIN decoder returned a partial result.");
    }
    if (!pick(rows, "Make") && !pick(rows, "Model")) {
      notes.push("VIN decoder did not return a full vehicle profile.");
    }
    return toDecodeResult(validation.normalized, notes, rows);
  } catch {
    return {
      vin: validation.normalized,
      valid: true,
      status: "unavailable",
      decodeSource: "nhtsa",
      make: null,
      model: null,
      year: null,
      trim: null,
      bodyClass: null,
      engine: null,
      fuelType: null,
      driveType: null,
      transmission: null,
      plantCountry: null,
      plantState: null,
      plantCity: null,
      manufacturer: null,
      raw: {},
      notes: ["VIN decoder service is unavailable."],
    };
  }
}
