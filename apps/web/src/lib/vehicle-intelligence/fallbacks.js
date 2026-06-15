import { validateDiagnosticJson, validateMaintenancePlan } from "./schemas.js";
import { classifySafetyRisk, sanitizeCustomerSelfCheckSteps } from "./safety.js";

function joinParts(parts) {
  return parts
    .map((part) => (part == null ? "" : String(part).trim()))
    .filter(Boolean)
    .join(" · ");
}

function clampConfidence(value) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function inferCauses(text, severity) {
  const candidates = [];
  const push = (cause, confidence, explanation) => {
    if (candidates.some((entry) => entry.cause === cause)) return;
    candidates.push({ cause, confidence: clampConfidence(confidence), explanation });
  };

  if (/misfire|rough idle|shaking|vibration/i.test(text)) {
    push("Engine misfire", 0.9, "The symptoms point to combustion imbalance or ignition/fuel delivery issues.");
  }
  if (/coolant|overheat|temperature/i.test(text)) {
    push("Cooling system fault", 0.92, "The engine temperature or coolant warning suggests a cooling-system problem.");
  }
  if (/brake|pedal|abs/i.test(text)) {
    push("Brake system issue", 0.95, "Brake-related symptoms should be treated as safety-critical.");
  }
  if (/steer|wheel|alignment|pulling/i.test(text)) {
    push("Steering or suspension issue", 0.84, "Pulling, steering effort, or wheel instability can come from suspension or steering wear.");
  }
  if (/battery|voltage|electrical|charging/i.test(text)) {
    push("Charging or electrical fault", 0.78, "Electrical warnings often indicate charging, battery, or wiring faults.");
  }
  if (/fuel smell|fuel leak|fuel/i.test(text)) {
    push("Fuel delivery or leak", 0.9, "Fuel odor or leakage requires immediate workshop attention.");
  }

  if (candidates.length === 0) {
    push(
      severity === "critical"
        ? "Immediate workshop inspection"
        : severity === "high"
          ? "Mechanical or electrical issue"
          : "Inspection required",
      severity === "critical" ? 0.78 : 0.55,
      "The report does not map to one obvious failure mode, so an inspection is needed to confirm the cause.",
    );
  }

  return candidates.slice(0, 5);
}

function inferServiceCategory(text, severity) {
  if (/brake|pedal|abs/i.test(text)) return "Brake inspection";
  if (/coolant|overheat|temperature/i.test(text)) return "Cooling system inspection";
  if (/battery|charging|electrical|voltage/i.test(text)) return "Electrical diagnostics";
  if (/steer|alignment|suspension|wheel/i.test(text)) return "Steering and suspension inspection";
  if (/fuel|smell|leak/i.test(text)) return "Fuel system inspection";
  if (/transmission|gear|shift/i.test(text)) return "Drivetrain inspection";
  if (severity === "critical") return "Emergency workshop inspection";
  if (severity === "high") return "Diagnostic inspection";
  return "General vehicle inspection";
}

function buildFollowUps(text) {
  const questions = [];
  if (!/when|after|during|at speed/i.test(text)) {
    questions.push("When does the issue happen most often?");
  }
  if (!/light|warning|dashboard/i.test(text)) {
    questions.push("Are any warning lights or messages showing?");
  }
  if (!/noise|smell|smoke|leak/i.test(text)) {
    questions.push("Did you notice any unusual noise, smell, smoke, or fluid leak?");
  }
  if (!/speed|idle|turning|brake/i.test(text)) {
    questions.push("Does the problem happen while driving, idling, braking, or turning?");
  }
  return questions.slice(0, 6);
}

export function buildFallbackDiagnostic({
  symptoms,
  drivingCondition,
  mileage = null,
  severityInput,
  warningLights,
  vin,
  dtcSummary,
}) {
  const assessment = classifySafetyRisk({
    symptoms,
    drivingCondition,
    severityInput,
    warningLights,
  });
  const text = [symptoms, drivingCondition, mileage, warningLights?.join(" "), dtcSummary, vin?.make, vin?.model]
    .filter(Boolean)
    .join(" ");
  const severity = assessment.severity;
  const causes = inferCauses(text, severity);
  const serviceCategory = inferServiceCategory(text, severity);
  const quoteEligible =
    assessment.quoteDraftEligible &&
    severity !== "critical" &&
    severity !== "high";

  const recommendedActions =
    severity === "critical"
      ? ["Stop driving safely as soon as possible.", "Contact your workshop or roadside assistance."]
      : severity === "high"
        ? ["Book a workshop inspection.", "Avoid long-distance driving until inspected."]
        : ["Schedule an inspection if the issue returns.", "Capture any warning lights or noises when it happens."];

  const safeSelfCheckSteps =
    severity === "critical"
      ? []
      : sanitizeCustomerSelfCheckSteps(
          [
            "Check dashboard warning lights",
            "Take a photo",
            "Note when it happens",
            "Inspect for visible leaks",
            "Confirm fuel cap is tight",
            "Listen for unusual noise while parked",
          ],
          severity,
        );

  const diagnostic = {
    severity,
    stopDrivingWarning: assessment.stopDrivingWarning,
    possibleCauses: causes,
    recommendedActions,
    safeSelfCheckSteps,
    workshopRequired: assessment.workshopRequired,
    suggestedServiceCategory: serviceCategory,
    estimatedInspectionMinutes:
      severity === "critical"
        ? 30
        : severity === "high"
          ? 60
          : severity === "medium"
            ? 45
            : 30,
    quoteDraftEligible: quoteEligible,
    followUpQuestions: buildFollowUps(text),
  };

  const parsed = validateDiagnosticJson(diagnostic);
  return parsed.ok ? parsed.data : diagnostic;
}

export function buildFallbackMaintenancePlan({
  diagnosis,
  mileage = null,
}) {
  const today = new Date();
  const nextServiceDate = new Date(today);
  nextServiceDate.setDate(today.getDate() + (diagnosis.severity === "critical" ? 7 : diagnosis.severity === "high" ? 14 : 30));

  const nextMileage =
    typeof mileage === "number"
      ? mileage +
        (diagnosis.severity === "critical"
          ? 500
          : diagnosis.severity === "high"
            ? 1000
            : diagnosis.severity === "medium"
              ? 3000
              : 5000)
      : null;

  const items = [
    {
      title: "Workshop diagnosis",
      interval: "One-time",
      rationale: "Confirm the root cause with a qualified inspection before repairing.",
      priority: diagnosis.severity === "critical" ? "high" : "medium",
    },
    {
      title: "Fluid and leak inspection",
      interval: "During inspection",
      rationale: "Visible leaks or low levels can turn a minor issue into a major one.",
      priority: "medium",
    },
  ];

  const plan = {
    title: "Vehicle maintenance follow-up",
    summary:
      diagnosis.severity === "critical"
        ? "Immediate workshop attention required before further driving."
        : "A workshop inspection and follow-up plan are recommended.",
    items,
    nextServiceDate: nextServiceDate.toISOString(),
    nextServiceMileage: nextMileage,
    advisorReviewRequired: true,
  };

  const parsed = validateMaintenancePlan(plan);
  return parsed.ok ? parsed.data : plan;
}

export function buildCustomerExplanation(diagnosis) {
  const lead =
    diagnosis.severity === "critical"
      ? "This could be unsafe to drive."
      : diagnosis.severity === "high"
        ? "This needs workshop attention soon."
        : diagnosis.severity === "medium"
          ? "This should be checked soon."
          : "This looks lower risk, but should still be monitored.";

  const cause = diagnosis.possibleCauses[0]?.cause ?? "an internal issue";
  return `${lead} The most likely concern is ${cause}. This guidance is advisory and must be reviewed by a qualified workshop or service advisor.`;
}

export function buildAdvisorSummary({
  vehicle,
  diagnosis,
  vin,
  dtcSummary,
}) {
  const bits = [
    joinParts([vehicle.make, vehicle.model, vehicle.year]),
    vin?.vin ? `VIN: ${vin.vin}` : null,
    dtcSummary ?? null,
    `Severity: ${diagnosis.severity}`,
    `Workshop required: ${diagnosis.workshopRequired ? "yes" : "no"}`,
    `Quote draft eligible: ${diagnosis.quoteDraftEligible ? "yes" : "no"}`,
  ].filter(Boolean);
  return bits.join("\n");
}
