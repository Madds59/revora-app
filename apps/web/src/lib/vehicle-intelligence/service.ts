import "server-only";

import { createClient } from "@/lib/supabase/server";
import { decodeVin, validateVin } from "./vin.js";
import {
  buildSafetyOverrideFromText,
  classifySafetyRisk,
  enforceSafetyOverrides,
  sanitizeCustomerSelfCheckSteps,
} from "./safety.js";
import {
  validateDiagnosticJson,
  validateMaintenancePlan,
  validateVinDecode,
} from "./schemas.js";
import type { Json } from "@/lib/database.types";
import type {
  AiToolCallEntry,
  VehicleDiagnosticJson,
  VehicleIntelligenceResult,
  VehicleIntelligenceSeverity,
  VehicleMaintenancePlan,
  VehiclePortalSnapshot,
  VehicleSafetyAssessment,
  VehicleSymptomReportInput,
  VehicleSymptomReportWrite,
  VehicleVinDecode,
} from "./types";

type OpenAiJsonResponse = {
  diagnosis?: VehicleDiagnosticJson;
  maintenancePlan?: VehicleMaintenancePlan;
  customerExplanation?: string;
  advisorSummary?: string;
  suggestedServiceCategory?: string;
  suggestedLineItems?: Array<{
    name: string;
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
};

type VehicleRow = {
  id: string;
  business_id: string;
  customer_id: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  plate_number: string | null;
  vin: string | null;
  color: string | null;
  metadata: Record<string, unknown> | null;
};

type VehicleBusinessContext = {
  vehicle: VehicleRow;
  businessName: string;
  customerName: string | null;
  customerEmail: string | null;
};

function openAiConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY ?? null,
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  };
}

function joinParts(parts: Array<string | number | null | undefined>) {
  return parts
    .map((part) => (part == null ? "" : String(part).trim()))
    .filter(Boolean)
    .join(" · ");
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function inferCauses(text: string, severity: VehicleIntelligenceSeverity) {
  const candidates: Array<{ cause: string; confidence: number; explanation: string }> = [];
  const push = (cause: string, confidence: number, explanation: string) => {
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

function inferServiceCategory(text: string, severity: VehicleIntelligenceSeverity) {
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

function buildFollowUps(text: string) {
  const questions: string[] = [];
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
}: {
  dtcSummary?: string;
  drivingCondition?: string | null;
  mileage?: number | null;
  severityInput?: string | null;
  symptoms: string;
  vin?: VehicleVinDecode | null;
  warningLights?: string[];
}): VehicleDiagnosticJson {
  const assessment = classifySafetyRisk({
    symptoms,
    drivingCondition,
    severityInput,
    warningLights,
  });
  const text = [symptoms, drivingCondition, mileage, warningLights?.join(" "), dtcSummary, vin?.make, vin?.model]
    .filter(Boolean)
    .join(" ");
  const severity = assessment.severity as VehicleIntelligenceSeverity;
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
          assessment.severity,
        );

  const diagnostic = {
    severity: assessment.severity,
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
  return (parsed.ok ? parsed.data : diagnostic) as VehicleDiagnosticJson;
}

export function buildFallbackMaintenancePlan({
  vehicle: _vehicle,
  diagnosis,
  mileage = null,
}: {
  diagnosis: VehicleDiagnosticJson;
  mileage?: number | null;
  vehicle: VehicleRow;
}): VehicleMaintenancePlan {
  void _vehicle;
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
  return (parsed.ok ? parsed.data : plan) as VehicleMaintenancePlan;
}

export function buildCustomerExplanation(diagnosis: VehicleDiagnosticJson) {
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
}: {
  diagnosis: VehicleDiagnosticJson;
  dtcSummary?: string;
  vehicle: VehicleRow;
  vin?: VehicleVinDecode | null;
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

export async function callOpenAiJson({
  systemPrompt,
  userPrompt,
}: {
  systemPrompt: string;
  userPrompt: string;
}) {
  const { apiKey, model } = openAiConfig();
  if (!apiKey) return { ok: false as const, error: "OpenAI is not configured." };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      return { ok: false as const, error: `OpenAI request failed with ${response.status}.` };
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return { ok: false as const, error: "OpenAI returned empty content." };
    }

    const parsed = JSON.parse(content) as OpenAiJsonResponse;
    return { ok: true as const, data: parsed, model };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "OpenAI request failed.",
    };
  }
}

export async function loadVehicleBusinessContext(vehicleId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, business_id, customer_id, make, model, year, plate_number, vin, color, metadata, business:businesses(name), customer:customers(full_name, email)")
    .eq("id", vehicleId)
    .maybeSingle();

  if (error) return { error: error.message, data: null as VehicleBusinessContext | null };
  if (!data) return { error: null, data: null as VehicleBusinessContext | null };

  const vehicle = data as unknown as VehicleRow & {
    business: { name: string } | null;
    customer: { full_name: string | null; email: string | null } | null;
  };

  return {
    error: null,
    data: {
      vehicle,
      businessName: vehicle.business?.name ?? "Business",
      customerName: vehicle.customer?.full_name ?? null,
      customerEmail: vehicle.customer?.email ?? null,
    } satisfies VehicleBusinessContext,
  };
}

export async function getVehiclePortalSnapshot(vehicleId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_vehicle_portal_snapshot", {
    target_vehicle_id: vehicleId,
  });

  if (error) return { error: error.message, data: null as VehiclePortalSnapshot | null };
  if (!data || data.length === 0) return { error: null, data: null as VehiclePortalSnapshot | null };

  const row = data[0] as {
    business_id: string;
    business_name: string;
    color: string | null;
    customer_explanation: string | null;
    customer_id: string;
    customer_name: string | null;
    latest_diagnostic_id: string | null;
    latest_diagnostic_severity: VehicleIntelligenceSeverity | null;
    latest_plan_id: string | null;
    latest_report_created_at: string | null;
    latest_report_id: string | null;
    latest_report_severity_input: string | null;
    latest_report_status: string | null;
    latest_report_symptoms: string | null;
    media_count: number | string;
    next_service_date: string | null;
    next_service_mileage: number | null;
    plate_number: string | null;
    stop_driving_warning: boolean;
    vehicle_id: string;
    vehicle_make: string | null;
    vehicle_model: string | null;
    vehicle_year: number | null;
    vin: string | null;
    workshop_required: boolean;
  };

  return {
    error: null,
    data: {
      vehicleId: row.vehicle_id,
      businessId: row.business_id,
      businessName: row.business_name,
      customerId: row.customer_id,
      customerName: row.customer_name,
      vehicleMake: row.vehicle_make,
      vehicleModel: row.vehicle_model,
      vehicleYear: row.vehicle_year,
      plateNumber: row.plate_number,
      vin: row.vin,
      color: row.color,
      latestReportId: row.latest_report_id,
      latestReportStatus: row.latest_report_status,
      latestReportCreatedAt: row.latest_report_created_at,
      latestReportSymptoms: row.latest_report_symptoms,
      latestReportSeverityInput: row.latest_report_severity_input,
      latestDiagnosticId: row.latest_diagnostic_id,
      latestDiagnosticSeverity: row.latest_diagnostic_severity,
      stopDrivingWarning: row.stop_driving_warning,
      workshopRequired: row.workshop_required,
      customerExplanation: row.customer_explanation,
      latestPlanId: row.latest_plan_id,
      nextServiceDate: row.next_service_date,
      nextServiceMileage: row.next_service_mileage,
      mediaCount: Number(row.media_count ?? 0),
    },
  };
}

export async function decodeVinForVehicle({
  vehicleId,
  vin,
}: {
  vehicleId: string;
  vin: string;
}) {
  void vehicleId;
  const validation = validateVin(vin);
  const decode = await decodeVin(vin);

  const parsed = validateVinDecode(decode);
  return {
    validation,
    decode: (parsed.ok ? parsed.data : decode) as VehicleVinDecode,
  };
}

export async function saveAiToolCall(entry: AiToolCallEntry) {
  const supabase = await createClient();
  await supabase.from("ai_tool_calls").insert({
    business_id: entry.businessId,
    user_id: entry.userId,
    vehicle_id: entry.vehicleId,
    tool_name: entry.toolName,
    input_json: entry.inputJson as Json,
    output_json: entry.outputJson as Json | null,
    model: entry.model,
    status: entry.status,
    error_message: entry.errorMessage,
    safety_flagged: entry.safetyFlagged,
    duration_ms: entry.durationMs,
  });
}

export async function saveSafetyFlag({
  businessId,
  vehicleId,
  symptomReportId,
  diagnosticResultId,
  triggeredBy,
  riskLevel,
  reason,
  matchedTerms,
  stopDrivingWarning,
}: {
  businessId?: string | null;
  diagnosticResultId?: string | null;
  matchedTerms: string[];
  reason: string;
  riskLevel: VehicleIntelligenceSeverity;
  stopDrivingWarning: boolean;
  symptomReportId?: string | null;
  triggeredBy: string;
  vehicleId?: string | null;
}) {
  const supabase = await createClient();
  await supabase.from("ai_safety_flags").insert({
    business_id: businessId ?? null,
    vehicle_id: vehicleId ?? null,
    symptom_report_id: symptomReportId ?? null,
    diagnostic_result_id: diagnosticResultId ?? null,
    triggered_by: triggeredBy,
    risk_level: riskLevel,
    reason,
    matched_terms: matchedTerms,
    stop_driving_warning: stopDrivingWarning,
  });
}

export async function saveSymptomReport(write: VehicleSymptomReportWrite) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_symptom_reports")
    .insert({
      business_id: write.businessId,
      customer_id: write.customerId,
      vehicle_id: write.vehicleId,
      submitted_by: write.submittedBy,
      submitted_by_type: write.submittedByType,
      symptoms: write.symptoms,
      symptom_tags: write.symptomTags,
      mileage: write.mileage,
      driving_condition: write.drivingCondition,
      warning_lights: write.warningLights,
      severity_input: write.severityInput,
      source: write.source,
      status: "submitted",
    })
    .select("id, created_at")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not save symptom report.", data: null as { id: string; created_at: string } | null };
  }

  return { error: null, data };
}

export async function saveDiagnosticResult({
  businessId,
  vehicleId,
  symptomReportId,
  generatedBy,
  diagnosis,
  assessment,
  customerExplanation,
  advisorSummary,
  model,
}: {
  assessment: ReturnType<typeof classifySafetyRisk>;
  advisorSummary: string;
  businessId: string;
  customerExplanation: string;
  diagnosis: VehicleDiagnosticJson;
  generatedBy: string | null;
  model: string | null;
  symptomReportId: string | null;
  vehicleId: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_diagnostic_results")
    .insert({
      business_id: businessId,
      vehicle_id: vehicleId,
      symptom_report_id: symptomReportId,
      generated_by: generatedBy,
      diagnosis_json: diagnosis,
      severity: assessment.severity,
      stop_driving_warning: assessment.stopDrivingWarning,
      workshop_required: assessment.workshopRequired,
      quote_draft_eligible: assessment.quoteDraftEligible,
      advisor_summary: advisorSummary,
      customer_explanation: customerExplanation,
      model,
    })
    .select("id, created_at")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not save diagnostic result.", data: null as { id: string; created_at: string } | null };
  }

  return { error: null, data };
}

export async function saveMaintenancePlan({
  businessId,
  vehicleId,
  generatedBy,
  plan,
}: {
  businessId: string;
  generatedBy: string | null;
  plan: VehicleMaintenancePlan;
  vehicleId: string;
}) {
  void vehicleId;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_maintenance_plans")
    .insert({
      business_id: businessId,
      vehicle_id: vehicleId,
      generated_by: generatedBy,
      plan_json: plan,
      next_service_date: plan.nextServiceDate ? plan.nextServiceDate.slice(0, 10) : null,
      next_service_mileage: plan.nextServiceMileage,
    })
    .select("id, created_at")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not save maintenance plan.", data: null as { id: string; created_at: string } | null };
  }

  return { error: null, data };
}

export async function saveDtcCodes({
  businessId,
  vehicleId,
  diagnosticResultId,
  codes,
}: {
  businessId: string;
  codes: Array<{
    code: string;
    system: string | null;
    title: string | null;
    description: string | null;
    severity: VehicleIntelligenceSeverity;
    source: "manual" | "obd_upload" | "ai" | "verified_database";
  }>;
  diagnosticResultId: string | null;
  vehicleId: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("vehicle_dtc_codes").insert(
    codes.map((code) => ({
      business_id: businessId,
      vehicle_id: vehicleId,
      diagnostic_result_id: diagnosticResultId,
      code: code.code,
      system: code.system,
      title: code.title,
      description: code.description,
      severity: code.severity,
      source: code.source,
    })),
  );

  return { error: error?.message ?? null };
}

export async function enrichVehicleMetadataWithVin({
  vehicleId,
  decode,
}: {
  decode: VehicleVinDecode;
  vehicleId: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicles")
    .update({
      make: decode.make ?? undefined,
      model: decode.model ?? undefined,
      year: decode.year ?? undefined,
      metadata: {
        vin_decode: decode,
      },
    })
    .eq("id", vehicleId);

  return { error: error?.message ?? null };
}

export async function createQuoteDraftFromDiagnosis({
  businessId,
  customerId,
  vehicleId,
  userId,
  targetCurrency = "AED",
}: {
  businessId: string;
  customerId: string;
  targetCurrency?: string;
  userId: string;
  vehicleId: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_quotation_draft", {
    target_business_id: businessId,
    target_customer_id: customerId,
    target_vehicle_id: vehicleId,
    target_created_by: userId,
    target_currency: targetCurrency,
  });

  if (error || !data) {
    return { error: error?.message ?? "Could not create the quotation draft.", data: null as string | null };
  }

  return { error: null, data };
}

export function buildVehicleIntelligenceResult({
  diagnosis,
  maintenancePlan,
  model,
  rawOutput,
  aiUsed,
}: {
  aiUsed: boolean;
  diagnosis: VehicleDiagnosticJson;
  maintenancePlan: VehicleMaintenancePlan;
  model: string | null;
  rawOutput: unknown;
}): VehicleIntelligenceResult {
  return {
    diagnosis,
    safety: classifySafetyRisk({
      symptoms: diagnosis.followUpQuestions.join(" "),
      severityInput: diagnosis.severity,
    }) as VehicleSafetyAssessment,
    maintenancePlan,
    model,
    rawOutput,
    aiUsed,
  };
}

function buildDiagnosticPrompt({
  symptoms,
  warningLights,
  drivingCondition,
  mileage,
  vin,
  dtcSummary,
  safety,
}: {
  drivingCondition: string | null;
  dtcSummary: string | null;
  mileage: number | null;
  safety: ReturnType<typeof classifySafetyRisk>;
  symptoms: string;
  vin: VehicleVinDecode | null;
  warningLights: string[];
}) {
  return [
    `Symptoms: ${symptoms}`,
    `Warning lights: ${warningLights.join(", ") || "none"}`,
    `Driving condition: ${drivingCondition ?? "unknown"}`,
    `Mileage: ${mileage ?? "unknown"}`,
    `VIN: ${vin?.vin ?? "unknown"}`,
    `Vehicle: ${joinParts([vin?.make, vin?.model, vin?.year]) || "unknown"}`,
    `Safety assessment: ${JSON.stringify(safety)}`,
    `Verified DTC summary: ${dtcSummary ?? "none"}`,
  ].join("\n");
}

export async function analyzeVehicleSymptoms({
  businessId,
  customerId,
  generatedBy,
  mileage,
  symptomTags,
  symptoms,
  source,
  submittedBy,
  submittedByType,
  vehicleId,
  drivingCondition,
  warningLights,
  severityInput,
  modelHint = null,
}: {
  businessId: string;
  customerId: string | null;
  drivingCondition: string | null;
  generatedBy: string | null;
  mileage: number | null;
  modelHint?: string | null;
  severityInput: string | null;
  source: VehicleSymptomReportInput["source"];
  submittedBy: string;
  submittedByType: VehicleSymptomReportWrite["submittedByType"];
  symptomTags: string[];
  symptoms: string;
  vehicleId: string;
  warningLights: string[];
}) {
  const { data: vehicleContext, error: contextError } = await loadVehicleBusinessContext(vehicleId);
  if (contextError || !vehicleContext) {
    return { error: contextError ?? "Vehicle not found.", data: null as null };
  }

  const report = await saveSymptomReport({
    businessId,
    customerId,
    vehicleId,
    submittedBy,
    submittedByType,
    symptoms,
    symptomTags,
    mileage,
    drivingCondition,
    warningLights,
    severityInput,
    source,
  });
  if (report.error || !report.data) {
    return { error: report.error ?? "Could not save symptom report.", data: null as null };
  }

  const assessment = classifySafetyRisk({
    symptoms,
    drivingCondition,
    severityInput,
    warningLights,
  }) as VehicleSafetyAssessment;

  const vin = vehicleContext.vehicle.vin
    ? ((await decodeVin(vehicleContext.vehicle.vin)) as VehicleVinDecode)
    : null;
  const safetySeed = buildSafetyOverrideFromText([symptoms, drivingCondition, warningLights.join(" ")].filter(Boolean).join(" "));
  const baseDiagnostic = buildFallbackDiagnostic({
    symptoms,
    drivingCondition,
    severityInput,
    warningLights,
    vin,
  });

  const baseMaintenance = buildFallbackMaintenancePlan({
    diagnosis: baseDiagnostic,
    mileage,
    vehicle: vehicleContext.vehicle,
  });

  const prompt = buildDiagnosticPrompt({
    symptoms,
    warningLights,
    drivingCondition,
    mileage,
    vin,
    dtcSummary: null,
    safety: assessment,
  });

  const ai = await callOpenAiJson({
    systemPrompt:
      "You are a cautious automotive workshop assistant. Return only valid JSON that matches the required vehicle diagnostic schema. Never invent specs or definitive faults. Use uncertainty. Escalate safety-critical symptoms immediately.",
    userPrompt: prompt,
  });

  const rawDiagnostic =
    ai.ok && ai.data?.diagnosis ? ai.data.diagnosis : baseDiagnostic;

  const validatedDiagnostic = validateDiagnosticJson(rawDiagnostic);
  const diagnostic = validatedDiagnostic.ok ? validatedDiagnostic.data : baseDiagnostic;
  const safetyApplied = enforceSafetyOverrides(diagnostic, assessment);
  const customerExplanation = ai.ok && typeof ai.data?.customerExplanation === "string"
    ? ai.data.customerExplanation
    : buildCustomerExplanation(safetyApplied);
  const advisorSummary = ai.ok && typeof ai.data?.advisorSummary === "string"
    ? ai.data.advisorSummary
    : buildAdvisorSummary({
        vehicle: vehicleContext.vehicle,
        diagnosis: safetyApplied,
        vin,
      });

  const diagnosticResult = await saveDiagnosticResult({
    assessment,
    advisorSummary,
    businessId,
    customerExplanation,
    diagnosis: safetyApplied,
    generatedBy,
    model: ai.ok ? ai.model : modelHint,
    symptomReportId: report.data.id,
    vehicleId,
  });

  const maintenancePlan = baseMaintenance;
  const maintenanceResult = await saveMaintenancePlan({
    businessId,
    generatedBy,
    plan: maintenancePlan,
    vehicleId,
  });

  if (assessment.severity === "critical" || !ai.ok || !validatedDiagnostic.ok) {
    await saveSafetyFlag({
      businessId,
      vehicleId,
      symptomReportId: report.data.id,
      diagnosticResultId: diagnosticResult.data?.id ?? null,
      triggeredBy: ai.ok ? "ai" : "rule_engine",
      riskLevel: assessment.severity,
      reason: assessment.reason,
      matchedTerms: assessment.matchedTerms,
      stopDrivingWarning: assessment.stopDrivingWarning,
    });
  }

  await saveAiToolCall({
    businessId,
    userId: generatedBy,
    vehicleId,
    toolName: "vehicle_diagnosis",
    inputJson: {
      symptoms,
      symptomTags,
      mileage,
      drivingCondition,
      warningLights,
      severityInput,
      source,
      prompt,
    },
    outputJson: {
      diagnostic: safetyApplied,
      maintenancePlan,
      customerExplanation,
      advisorSummary,
      safetySeed,
    },
    model: ai.ok ? ai.model : modelHint,
    status: ai.ok ? "success" : "blocked",
    errorMessage: ai.ok ? null : ai.error,
    safetyFlagged: assessment.severity !== "low",
    durationMs: null,
  });

  return {
    error: diagnosticResult.error ?? maintenanceResult.error ?? null,
    data: {
      report: report.data,
      diagnosticResult: diagnosticResult.data,
      diagnostic: safetyApplied,
      maintenancePlan,
      customerExplanation,
      advisorSummary,
      aiUsed: ai.ok,
      model: ai.ok ? ai.model : modelHint,
      vehicle: vehicleContext.vehicle,
    },
  };
}
