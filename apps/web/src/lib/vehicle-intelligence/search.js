import { z } from "zod";

import { callOpenAiJson } from "./openai.js";
import { classifySafetyRisk } from "./safety.js";

const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/i;
const DTC_PATTERN = /\b[PBCU][0-9]{4}\b/i;
const VIN_HINT_PATTERN = /\b(vin|vehicle identification number)\b/i;
const DTC_HINT_PATTERN = /\b(dtc|obd|diagnostic trouble code|trouble code|check engine code|codes?)\b/i;
const DANGER_PATTERN = /\b(brake|smoke|overheat|overheating|oil pressure|fuel leak|fuel smell|steering failure|loss of steering|airbag|high voltage|battery fire)\b/i;

const SEARCH_ENRICHMENT_SCHEMA = z.object({
  summary: z.string().trim().min(1).max(280),
});

const TOOL_ROUTES = {
  diagnosis: "/ai/vehicle-diagnosis",
  vin: "/ai/vin-decoder",
  dtc: "/ai/dtc-decoder",
};

const DEFAULT_REQUIRED_INPUTS = {
  diagnosis: ["vehicle", "symptoms", "warningLights", "drivingCondition", "mileage"],
  vin: ["vehicle", "vin"],
  dtc: ["vehicle", "codes"],
};

const DEFAULT_NEXT_STEPS = {
  diagnosis: ["reviewSafety", "captureVehicle", "captureSymptoms", "captureWarnings", "captureDrivingCondition", "captureMileage", "openDiagnosis"],
  vin: ["captureVehicle", "captureVin", "openVin"],
  dtc: ["captureVehicle", "captureCodes", "openDtc"],
};

function normalizeQuery(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function detectTool(query) {
  if (DANGER_PATTERN.test(query)) return "diagnosis";
  if (VIN_PATTERN.test(query) || VIN_HINT_PATTERN.test(query)) return "vin";
  if (DTC_PATTERN.test(query) || DTC_HINT_PATTERN.test(query)) return "dtc";
  return "diagnosis";
}

function buildBaseResult(query) {
  const normalized = normalizeQuery(query);
  if (!normalized) return null;

  const tool = detectTool(normalized);
  const safety = classifySafetyRisk({
    symptoms: normalized,
    drivingCondition: normalized,
    warningLights: [normalized],
  });

  const resultSafety =
    tool === "diagnosis"
      ? safety
      : {
          severity: "low",
          stopDrivingWarning: false,
          workshopRequired: false,
          quoteDraftEligible: true,
          matchedTerms: [],
          reason: "Rule-based routing selected a tool-specific workflow.",
        };

  return {
    query: normalized,
    tool,
    route: TOOL_ROUTES[tool],
    requiredInputs: DEFAULT_REQUIRED_INPUTS[tool],
    nextSteps: DEFAULT_NEXT_STEPS[tool],
    safety: resultSafety,
    aiUsed: false,
    assistantSummary: null,
    model: null,
  };
}

export function buildVehicleIntelligenceSearchResult(query) {
  return buildBaseResult(query);
}

export async function enrichVehicleIntelligenceSearchResult({
  baseResult,
  locale = "en",
}) {
  if (!baseResult) return null;
  if (baseResult.safety.stopDrivingWarning) return baseResult;

  const ai = await callOpenAiJson({
    systemPrompt:
      locale === "ar"
        ? "أنت مساعد ورشة سيارات حذر. أعد JSON صالحًا فقط يحتوي على summary واحد قصير. لا تغيّر الأداة المقترحة، ولا تخترع حقائق عن المركبة، ولا تتجاوز السلامة."
        : "You are a cautious automotive workshop assistant. Return only valid JSON with a short summary field. Do not change the recommended tool, do not invent vehicle facts, and do not weaken safety.",
    userPrompt: JSON.stringify(
      {
        query: baseResult.query,
        tool: baseResult.tool,
        requiredInputs: baseResult.requiredInputs,
        nextSteps: baseResult.nextSteps,
        safety: {
          severity: baseResult.safety.severity,
          stopDrivingWarning: baseResult.safety.stopDrivingWarning,
          workshopRequired: baseResult.safety.workshopRequired,
        },
      },
      null,
      2,
    ),
  });

  if (!ai.ok) return baseResult;

  const parsed = SEARCH_ENRICHMENT_SCHEMA.safeParse(ai.data);
  if (!parsed.success) return baseResult;

  return {
    ...baseResult,
    aiUsed: true,
    assistantSummary: parsed.data.summary,
    model: ai.model ?? null,
  };
}
