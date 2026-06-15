import { validateDtcInterpretation } from "./schemas.js";

const DTC_LIBRARY = [
  {
    code: "P0300",
    title: "Random or multiple cylinder misfire detected",
    description:
      "The engine control module detected unstable combustion across one or more cylinders.",
    severity: "high",
    system: "Powertrain",
    source: "verified_database",
    workshopRequired: true,
    stopDrivingWarning: false,
    confidence: 0.94,
    explanation:
      "Misfires can damage the catalytic converter and usually require workshop diagnostics.",
    recommendedActions: [
      "Check for misfire symptoms, rough idle, or flashing check-engine light.",
      "Schedule a workshop scan and ignition/fuel system inspection.",
    ],
  },
  {
    code: "P0420",
    title: "Catalyst system efficiency below threshold",
    description:
      "The emissions system is reporting catalyst performance below expected levels.",
    severity: "medium",
    system: "Powertrain",
    source: "verified_database",
    workshopRequired: true,
    stopDrivingWarning: false,
    confidence: 0.88,
    explanation:
      "This is usually not immediately dangerous but needs a workshop inspection to confirm the cause.",
    recommendedActions: [
      "Check for exhaust leaks or engine faults that could trigger the code.",
      "Book an emissions-system inspection.",
    ],
  },
  {
    code: "P0171",
    title: "System too lean (bank 1)",
    description:
      "The engine is running lean on bank 1, often due to air leaks or fuel-delivery issues.",
    severity: "medium",
    system: "Powertrain",
    source: "verified_database",
    workshopRequired: true,
    stopDrivingWarning: false,
    confidence: 0.88,
    explanation:
      "Lean conditions can affect drivability and fuel economy, so a workshop diagnosis is recommended.",
    recommendedActions: [
      "Check for vacuum leaks or intake issues.",
      "Schedule a workshop diagnostic scan.",
    ],
  },
  {
    code: "P0172",
    title: "System too rich (bank 1)",
    description:
      "The fuel mixture is richer than expected on bank 1.",
    severity: "medium",
    system: "Powertrain",
    source: "verified_database",
    workshopRequired: true,
    stopDrivingWarning: false,
    confidence: 0.84,
    explanation:
      "A rich mixture can cause poor fuel economy and emissions issues and should be checked by a workshop.",
    recommendedActions: [
      "Check for fuel-system faults or sensor issues.",
      "Schedule a workshop diagnostic scan.",
    ],
  },
  {
    code: "P0128",
    title: "Coolant thermostat below regulating temperature",
    description:
      "The engine is not reaching its expected operating temperature.",
    severity: "medium",
    system: "Powertrain",
    source: "verified_database",
    workshopRequired: true,
    stopDrivingWarning: false,
    confidence: 0.86,
    explanation:
      "Cooling-system faults can worsen over time and should be checked before they become severe.",
    recommendedActions: [
      "Check coolant level only when the engine is cold.",
      "Book a workshop cooling-system inspection.",
    ],
  },
  {
    code: "U0100",
    title: "Lost communication with engine control module",
    description:
      "The vehicle network is losing communication with a critical control module.",
    severity: "high",
    system: "Network",
    source: "verified_database",
    workshopRequired: true,
    stopDrivingWarning: false,
    confidence: 0.9,
    explanation:
      "A communication fault can affect multiple systems and needs workshop-level electrical diagnostics.",
    recommendedActions: [
      "Check battery health and charging voltage.",
      "Book an electrical diagnostic inspection.",
    ],
  },
  {
    code: "C0035",
    title: "Left front wheel speed sensor circuit",
    description: "The ABS or stability system is flagging a wheel-speed sensor fault.",
    severity: "medium",
    system: "Chassis",
    source: "verified_database",
    workshopRequired: true,
    stopDrivingWarning: false,
    confidence: 0.8,
    explanation:
      "ABS and stability systems should be checked by a workshop, especially if warning lights are on.",
    recommendedActions: [
      "Avoid harsh braking until the system is checked.",
      "Schedule a workshop ABS inspection.",
    ],
  },
  {
    code: "B0020",
    title: "Airbag system fault",
    description:
      "The restraint system has reported an airbag or supplemental restraint fault.",
    severity: "critical",
    system: "Body",
    source: "verified_database",
    workshopRequired: true,
    stopDrivingWarning: true,
    confidence: 0.97,
    explanation:
      "Airbag faults are safety-critical and should be inspected immediately by a qualified workshop.",
    recommendedActions: [
      "Do not ignore the airbag warning light.",
      "Schedule an immediate workshop inspection.",
    ],
  },
];

function normalizeCode(code) {
  return String(code ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function severityForPrefix(code) {
  if (code.startsWith("P0") || code.startsWith("P1")) return "medium";
  if (code.startsWith("P2") || code.startsWith("P3")) return "high";
  if (code.startsWith("B")) return "high";
  if (code.startsWith("C")) return "medium";
  if (code.startsWith("U")) return "medium";
  return "low";
}

function genericInterpretation(code) {
  const severity = severityForPrefix(code);
  const stopDrivingWarning = severity === "high";
  const workshopRequired = severity !== "low";

  return {
    code,
    system: code.startsWith("P")
      ? "Powertrain"
      : code.startsWith("B")
        ? "Body"
        : code.startsWith("C")
          ? "Chassis"
          : code.startsWith("U")
            ? "Network"
            : null,
    title: "Unmapped diagnostic code",
    description:
      "The code is valid but not in the internal verified library, so a workshop scan is recommended.",
    severity,
    source: "ai",
    confidence: 0.55,
    explanation:
      "This code needs workshop confirmation because the system could not match it to a verified internal definition.",
    recommendedActions: [
      "Capture the code exactly as shown.",
      "Book a workshop diagnostic scan.",
    ],
    workshopRequired,
    stopDrivingWarning,
  };
}

export function validateDtcCodes(codes) {
  const normalized = [];
  for (const raw of codes ?? []) {
    const code = normalizeCode(raw);
    if (!/^[PBCU][0-9]{4}$/.test(code)) continue;
    if (!normalized.includes(code)) normalized.push(code);
  }
  return normalized;
}

export function interpretSingleDtc(code) {
  const normalized = normalizeCode(code);
  if (!/^[PBCU][0-9]{4}$/.test(normalized)) {
    return {
      code: normalized,
      system: null,
      title: "Invalid diagnostic code",
      description: "The code does not match the expected OBD format.",
      severity: "low",
      source: "manual",
      confidence: 0.1,
      explanation: "The code should look like P0300, B0020, C0035, or U0100.",
      recommendedActions: ["Recheck the code and enter it again."],
      workshopRequired: false,
      stopDrivingWarning: false,
    };
  }

  const known = DTC_LIBRARY.find((item) => item.code === normalized);
  const result = known ? { ...known } : genericInterpretation(normalized);
  const parsed = validateDtcInterpretation(result);
  return parsed.ok ? parsed.data : result;
}

export function interpretDtcCodes(codes) {
  return validateDtcCodes(codes).map((code) => interpretSingleDtc(code));
}

