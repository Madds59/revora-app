const CRITICAL_PATTERNS = [
  /brake(s)? (failure|failed|not working|gone|soft|spongy|no pressure)/i,
  /loss of steering/i,
  /steering (failure|failed|locked|hard|not working)/i,
  /\bsmoke\b/i,
  /overheat(ing|ed)?/i,
  /oil pressure/i,
  /fuel smell/i,
  /fuel leak/i,
  /airbag/i,
  /hybrid battery/i,
  /ev battery/i,
  /high voltage/i,
  /electrical burning smell/i,
  /vehicle fire/i,
  /sudden loss of power at speed/i,
];

const HIGH_RISK_PATTERNS = [
  /engine misfire/i,
  /stall(ing)?/i,
  /limp mode/i,
  /check engine/i,
  /transmission/i,
  /coolant leak/i,
  /battery warning/i,
  /abs warning/i,
  /traction control/i,
  /suspension/i,
  /wheel speed sensor/i,
  /communication error/i,
];

const SAFE_SELF_CHECK_ALLOWLIST = [
  /check dashboard warning lights/i,
  /take a photo/i,
  /note when it happens/i,
  /inspect for visible leaks/i,
  /confirm fuel cap is tight/i,
  /inspect tire pressure visually/i,
  /listen for unusual noise while parked/i,
  /scan with an obd reader/i,
  /record the odometer/i,
];

const DANGEROUS_KEYWORDS = [
  /remove/i,
  /replace/i,
  /disconnect/i,
  /open/i,
  /lift/i,
  /jack/i,
  /crawl/i,
  /bleed/i,
  /pressure/i,
  /coolant cap/i,
  /oil cap/i,
  /battery terminal/i,
  /high voltage/i,
  /airbag/i,
  /brake line/i,
  /steering column/i,
  /fuel line/i,
];

const SEVERITY_ORDER = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function joinText(parts) {
  return parts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .filter(Boolean)
    .map((part) => String(part))
    .join(" | ");
}

function maxSeverity(current, next) {
  return SEVERITY_ORDER[next] > SEVERITY_ORDER[current] ? next : current;
}

export function classifySafetyRisk(input) {
  const text = normalizeText(
    joinText([
      input?.symptoms,
      input?.drivingCondition,
      input?.severityInput,
      input?.warningLights,
    ]),
  );

  const matchedTerms = [];
  let severity = "low";
  let stopDrivingWarning = false;
  let workshopRequired = false;
  let quoteDraftEligible = true;
  let reason = "No critical safety trigger found.";

  for (const pattern of CRITICAL_PATTERNS) {
    if (pattern.test(text)) {
      matchedTerms.push(pattern.source ?? pattern.toString());
      severity = "critical";
      stopDrivingWarning = true;
      workshopRequired = true;
      quoteDraftEligible = false;
      reason = "Critical safety symptom detected.";
      break;
    }
  }

  if (severity !== "critical") {
    for (const pattern of HIGH_RISK_PATTERNS) {
      if (pattern.test(text)) {
        matchedTerms.push(pattern.source ?? pattern.toString());
        severity = maxSeverity(severity, "high");
      }
    }

    if (/urgent|severe|danger/i.test(text)) {
      severity = maxSeverity(severity, "high");
    }
    if (/intermittent|sometimes|occasionally/i.test(text)) {
      severity = maxSeverity(severity, "medium");
    }

    stopDrivingWarning = severity === "high" || severity === "critical";
    workshopRequired = severity !== "low";
    quoteDraftEligible = severity === "low" || severity === "medium";
    reason =
      severity === "high"
        ? "High-risk symptom pattern detected."
        : severity === "medium"
          ? "Potentially serious symptom pattern detected."
          : "No critical safety trigger found.";
  }

  const severityHint = normalizeText(input?.severityInput);
  if (severityHint === "critical") {
    severity = "critical";
  } else if (severityHint === "high") {
    severity = maxSeverity(severity, "high");
  } else if (severityHint === "medium") {
    severity = maxSeverity(severity, "medium");
  }

  if (severity === "critical") {
    stopDrivingWarning = true;
    workshopRequired = true;
    quoteDraftEligible = false;
  }

  return {
    severity,
    stopDrivingWarning,
    workshopRequired,
    quoteDraftEligible,
    matchedTerms,
    reason,
  };
}

export function sanitizeCustomerSelfCheckSteps(steps, severity = "low") {
  if (severity === "high" || severity === "critical") {
    return [];
  }

  const seen = new Set();
  const safeSteps = [];

  for (const rawStep of steps ?? []) {
    const step = String(rawStep ?? "").trim();
    if (!step) continue;

    const safe = SAFE_SELF_CHECK_ALLOWLIST.some((pattern) => pattern.test(step));
    const dangerous = DANGEROUS_KEYWORDS.some((pattern) => pattern.test(step));
    if (!safe || dangerous) continue;

    const normalized = step.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    safeSteps.push(step);
  }

  return safeSteps.slice(0, 6);
}

export function enforceSafetyOverrides(diagnosticJson, assessment) {
  const next = structuredClone(diagnosticJson);

  next.severity = assessment.severity;
  next.stopDrivingWarning = assessment.stopDrivingWarning;
  next.workshopRequired = assessment.workshopRequired;
  next.quoteDraftEligible = assessment.quoteDraftEligible;

  if (assessment.severity === "critical") {
    next.recommendedActions = [
      "Stop driving safely as soon as possible.",
      "Contact your workshop or roadside assistance.",
    ];
    next.safeSelfCheckSteps = [];
    next.followUpQuestions = [
      "Is the vehicle currently safe to move?",
      "Are warning lights flashing or is there smoke/leakage?",
    ];
  } else {
    next.safeSelfCheckSteps = sanitizeCustomerSelfCheckSteps(
      next.safeSelfCheckSteps,
      assessment.severity,
    );
  }

  return next;
}

export function buildSafetyOverrideFromText(text) {
  return classifySafetyRisk({ symptoms: text, drivingCondition: text, warningLights: [text] });
}
