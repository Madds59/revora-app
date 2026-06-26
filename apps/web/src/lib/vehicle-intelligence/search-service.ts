import "server-only";

import { getUser, requireMembership } from "@/lib/auth";
import type { Json } from "@/lib/database.types";
import { formatVehicleLabel } from "@/lib/vehicle-intelligence/labels";
import { canManageCustomers } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

import { saveAiToolCall } from "./service";
import {
  buildGroundedVehicleSearchSummary,
  deriveVehicleSearchHints,
  isRecordInDateRange,
  matchesSearchText,
  parseVehicleSearchInput,
  redactUuidText,
} from "./search.js";

export type VehicleSearchResultType =
  | "vehicles"
  | "symptoms"
  | "dtc"
  | "diagnostics"
  | "maintenance"
  | "quotes";

export type VehicleSearchSafetyLevel = "low" | "medium" | "high" | "critical" | null;

export type VehicleSearchResult = {
  createdAt: string | null;
  customerLabel: string | null;
  dateForFilter: string | null;
  id: string;
  safetyLevel: VehicleSearchSafetyLevel;
  searchText: Array<string | number | null | undefined>;
  sourceHref: string;
  sourceLabel: string;
  sourceMarker: string;
  sourceNote: string;
  stopDrivingWarning: boolean;
  subtitle: string;
  summary: string;
  title: string;
  type: VehicleSearchResultType;
  vehicleId: string | null;
  vehicleLabel: string | null;
};

export type VehicleSearchSummary = {
  citedRecords: Array<{ sourceMarker: string; title: string; type: string }>;
  dataInsufficient: boolean;
  safetyWarning: boolean;
  text: string;
};

export type VehicleSearchResponse = {
  error: string | null;
  filters: {
    dateRange: string;
    query: string;
    safety: string;
    type: string;
  };
  resultGroups: Array<{
    count: number;
    results: VehicleSearchResult[];
    type: VehicleSearchResultType;
  }>;
  results: VehicleSearchResult[];
  summary: VehicleSearchSummary | null;
};

type Locale = "en" | "ar";

type VehicleRow = {
  color: string | null;
  created_at: string;
  customer:
    | {
        email: string | null;
        full_name: string | null;
        id: string;
      }
    | null;
  customer_id: string;
  id: string;
  make: string | null;
  model: string | null;
  plate_number: string | null;
  updated_at: string;
  vin: string | null;
  year: number | null;
};

type SymptomRow = {
  created_at: string;
  customer_id: string | null;
  driving_condition: string | null;
  id: string;
  mileage: number | null;
  severity_input: string | null;
  source: string;
  status: string;
  symptom_tags: string[];
  symptoms: string;
  updated_at: string;
  vehicle_id: string;
  warning_lights: string[];
};

type DiagnosticRow = {
  advisor_summary: string | null;
  created_at: string;
  customer_explanation: string | null;
  diagnosis_json: Json;
  id: string;
  quote_draft_eligible: boolean;
  severity: string;
  stop_driving_warning: boolean;
  symptom_report_id: string | null;
  vehicle_id: string;
  workshop_required: boolean;
};

type DtcRow = {
  code: string;
  created_at: string;
  description: string | null;
  diagnostic_result_id: string | null;
  id: string;
  severity: string | null;
  source: string;
  system: string | null;
  title: string | null;
  vehicle_id: string;
};

type MaintenanceRow = {
  created_at: string;
  id: string;
  next_service_date: string | null;
  next_service_mileage: number | null;
  plan_json: Json;
  updated_at: string;
  vehicle_id: string;
};

type ToolCallRow = {
  created_at: string;
  id: string;
  input_json: Json;
  output_json: Json | null;
  safety_flagged: boolean;
  status: string;
  tool_name: string;
  vehicle_id: string | null;
};

const RESULT_ORDER: VehicleSearchResultType[] = [
  "vehicles",
  "symptoms",
  "dtc",
  "diagnostics",
  "maintenance",
  "quotes",
];

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function truncate(value: string | null | undefined, limit = 180) {
  const text = redactUuidText(value ?? "", "record").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}…`;
}

function vehicleSummary(vehicle: VehicleRow, locale: Locale) {
  const parts = [
    vehicle.customer?.full_name,
    vehicle.plate_number ? `${locale === "ar" ? "اللوحة" : "Plate"} ${vehicle.plate_number}` : null,
    vehicle.vin ? `${locale === "ar" ? "VIN ينتهي" : "VIN ending"} ${vehicle.vin.slice(-6).toUpperCase()}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function sourceHref(path: string, locale: Locale) {
  return `/${locale}${path}`;
}

function severityFromValue(value: string | null | undefined): VehicleSearchSafetyLevel {
  return value === "low" || value === "medium" || value === "high" || value === "critical"
    ? value
    : null;
}

function planTitle(plan: Json): string | null {
  if (plan && typeof plan === "object" && !Array.isArray(plan)) {
    return asText((plan as Record<string, unknown>).title);
  }
  return null;
}

function planSummary(plan: Json): string | null {
  if (plan && typeof plan === "object" && !Array.isArray(plan)) {
    return asText((plan as Record<string, unknown>).summary);
  }
  return null;
}

function diagnosisCause(diagnosis: Json): string | null {
  if (!diagnosis || typeof diagnosis !== "object" || Array.isArray(diagnosis)) return null;
  const causes = (diagnosis as Record<string, unknown>).possibleCauses;
  if (!Array.isArray(causes)) return null;
  const first = causes[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) return null;
  return asText((first as Record<string, unknown>).cause);
}

function quoteIdFromOutput(output: Json | null): string | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  return asText((output as Record<string, unknown>).quoteId);
}

function resultRank(result: VehicleSearchResult) {
  const safetyRank = result.stopDrivingWarning
    ? 3
    : result.safetyLevel === "critical"
      ? 3
      : result.safetyLevel === "high"
        ? 2
        : result.safetyLevel === "medium"
          ? 1
          : 0;
  const time = result.dateForFilter ? new Date(result.dateForFilter).getTime() : 0;
  return safetyRank * 10_000_000_000_000 + (Number.isFinite(time) ? time : 0);
}

function filterResults({
  results,
  query,
  type,
  dateRange,
  safety,
}: {
  dateRange: string;
  query: string;
  results: VehicleSearchResult[];
  safety: string;
  type: string;
}) {
  return results
    .filter((result) => type === "all" || result.type === type)
    .filter((result) => {
      if (safety === "all") return true;
      if (safety === "stop_driving") return result.stopDrivingWarning;
      return result.safetyLevel === safety;
    })
    .filter((result) => isRecordInDateRange(result.dateForFilter, dateRange))
    .filter((result) => matchesSearchText(result.searchText, query))
    .sort((a, b) => resultRank(b) - resultRank(a))
    .slice(0, 40);
}

function groupResults(results: VehicleSearchResult[]) {
  return RESULT_ORDER.map((type) => {
    const group = results.filter((result) => result.type === type);
    return { count: group.length, results: group, type };
  }).filter((group) => group.count > 0);
}

export async function searchVehicleIntelligence(input: {
  dateRange?: string;
  locale?: string;
  query?: string;
  safety?: string;
  type?: string;
}): Promise<VehicleSearchResponse> {
  const parsed = parseVehicleSearchInput(input);
  if (!parsed.success) {
    return {
      error: "Invalid search filters.",
      filters: {
        dateRange: "all",
        query: "",
        safety: "all",
        type: "all",
      },
      resultGroups: [],
      results: [],
      summary: null,
    };
  }

  const { dateRange, locale, query, safety, type } = parsed.data;
  const hints = deriveVehicleSearchHints(query);
  const effectiveDateRange = dateRange === "all" ? hints.dateRange : dateRange;
  const effectiveSafety = safety === "all" ? hints.safety : safety;
  const { member, business } = await requireMembership();
  if (!canManageCustomers(member.role)) {
    return {
      error: "no_access",
      filters: {
        dateRange: effectiveDateRange,
        query,
        safety: effectiveSafety,
        type,
      },
      resultGroups: [],
      results: [],
      summary: null,
    };
  }

  const startedAt = Date.now();
  const supabase = await createClient();
  const vehiclesPromise = supabase
    .from("vehicles")
    .select("id, customer_id, make, model, year, plate_number, vin, color, created_at, updated_at, customer:customers(id, full_name, email)")
    .eq("business_id", business.id)
    .order("updated_at", { ascending: false })
    .limit(250);
  const symptomsPromise = supabase
    .from("vehicle_symptom_reports")
    .select("id, vehicle_id, customer_id, symptoms, symptom_tags, mileage, driving_condition, warning_lights, severity_input, source, status, created_at, updated_at")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(150);
  const diagnosticsPromise = supabase
    .from("vehicle_diagnostic_results")
    .select("id, vehicle_id, symptom_report_id, diagnosis_json, severity, stop_driving_warning, workshop_required, quote_draft_eligible, advisor_summary, customer_explanation, created_at")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(150);
  const dtcPromise = supabase
    .from("vehicle_dtc_codes")
    .select("id, vehicle_id, diagnostic_result_id, code, system, title, description, severity, source, created_at")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(150);
  const maintenancePromise = supabase
    .from("vehicle_maintenance_plans")
    .select("id, vehicle_id, plan_json, next_service_date, next_service_mileage, created_at, updated_at")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(150);
  const quoteDraftPromise = supabase
    .from("ai_tool_calls")
    .select("id, vehicle_id, tool_name, input_json, output_json, status, safety_flagged, created_at")
    .eq("business_id", business.id)
    .eq("tool_name", "quote_draft_generator")
    .order("created_at", { ascending: false })
    .limit(100);

  const [
    vehiclesResponse,
    symptomsResponse,
    diagnosticsResponse,
    dtcResponse,
    maintenanceResponse,
    quoteDraftResponse,
  ] = await Promise.all([
    vehiclesPromise,
    symptomsPromise,
    diagnosticsPromise,
    dtcPromise,
    maintenancePromise,
    quoteDraftPromise,
  ]);

  if (
    vehiclesResponse.error ||
    symptomsResponse.error ||
    diagnosticsResponse.error ||
    dtcResponse.error ||
    maintenanceResponse.error ||
    quoteDraftResponse.error
  ) {
    console.error("searchVehicleIntelligence failed", {
      vehicles: vehiclesResponse.error,
      symptoms: symptomsResponse.error,
      diagnostics: diagnosticsResponse.error,
      dtc: dtcResponse.error,
      maintenance: maintenanceResponse.error,
      quoteDraft: quoteDraftResponse.error,
    });
    return {
      error: "Search failed.",
      filters: {
        dateRange: effectiveDateRange,
        query,
        safety: effectiveSafety,
        type,
      },
      resultGroups: [],
      results: [],
      summary: null,
    };
  }

  const vehicleRows = (vehiclesResponse.data ?? []) as unknown as VehicleRow[];
  const vehiclesById = new Map(vehicleRows.map((vehicle) => [vehicle.id, vehicle]));
  const vehicleLabel = (vehicle: VehicleRow | null | undefined) =>
    vehicle
      ? formatVehicleLabel(
          vehicle,
          locale === "ar" ? "مركبة" : "Vehicle",
          locale === "ar" ? "مركبة غير معروفة" : "Unknown vehicle",
        )
      : locale === "ar"
        ? "مركبة غير معروفة"
        : "Unknown vehicle";

  const results: VehicleSearchResult[] = [];
  for (const vehicle of vehicleRows) {
    const title = vehicleLabel(vehicle);
    const summary = vehicleSummary(vehicle, locale) || (locale === "ar" ? "سجل مركبة" : "Vehicle record");
    results.push({
      createdAt: vehicle.created_at,
      customerLabel: vehicle.customer?.full_name ?? vehicle.customer?.email ?? null,
      dateForFilter: vehicle.updated_at ?? vehicle.created_at,
      id: `vehicle:${vehicle.id}`,
      safetyLevel: null,
      searchText: [
        title,
        summary,
        vehicle.make,
        vehicle.model,
        vehicle.year,
        vehicle.plate_number,
        vehicle.vin,
        vehicle.customer?.full_name,
        vehicle.customer?.email,
      ],
      sourceHref: sourceHref(`/vehicles/${vehicle.id}`, locale),
      sourceLabel: locale === "ar" ? "فتح المركبة" : "Open vehicle",
      sourceMarker: `vehicle-${results.length + 1}`,
      sourceNote: locale === "ar" ? "سجل المركبة" : "Vehicle record",
      stopDrivingWarning: false,
      subtitle: summary,
      summary,
      title,
      type: "vehicles",
      vehicleId: vehicle.id,
      vehicleLabel: title,
    });
  }

  for (const [index, report] of ((symptomsResponse.data ?? []) as SymptomRow[]).entries()) {
    const vehicle = vehiclesById.get(report.vehicle_id);
    const title = locale === "ar" ? "تقرير أعراض" : "Symptom report";
    const summary = truncate(report.symptoms);
    results.push({
      createdAt: report.created_at,
      customerLabel: vehicle?.customer?.full_name ?? null,
      dateForFilter: report.created_at,
      id: `symptom:${report.id}`,
      safetyLevel: severityFromValue(report.severity_input),
      searchText: [
        title,
        summary,
        report.symptoms,
        report.symptom_tags.join(" "),
        report.warning_lights.join(" "),
        report.driving_condition,
        report.severity_input,
        vehicleLabel(vehicle),
        vehicle?.customer?.full_name,
        vehicle?.plate_number,
        vehicle?.vin,
      ],
      sourceHref: sourceHref(`/ai/vehicle-diagnosis?vehicle_id=${report.vehicle_id}`, locale),
      sourceLabel: locale === "ar" ? "فتح التشخيص" : "Open diagnosis",
      sourceMarker: `symptom-${index + 1}`,
      sourceNote: locale === "ar" ? "أعراض مسجلة" : "Recorded symptoms",
      stopDrivingWarning: report.severity_input === "critical",
      subtitle: vehicleLabel(vehicle),
      summary,
      title,
      type: "symptoms",
      vehicleId: report.vehicle_id,
      vehicleLabel: vehicleLabel(vehicle),
    });
  }

  for (const dtc of (dtcResponse.data ?? []) as DtcRow[]) {
    const vehicle = vehiclesById.get(dtc.vehicle_id);
    const title = [dtc.code, dtc.title].filter(Boolean).join(" · ");
    const summary = truncate(dtc.description ?? dtc.system ?? dtc.source);
    results.push({
      createdAt: dtc.created_at,
      customerLabel: vehicle?.customer?.full_name ?? null,
      dateForFilter: dtc.created_at,
      id: `dtc:${dtc.id}`,
      safetyLevel: severityFromValue(dtc.severity),
      searchText: [
        title,
        summary,
        dtc.code,
        dtc.title,
        dtc.description,
        dtc.system,
        dtc.severity,
        vehicleLabel(vehicle),
        vehicle?.customer?.full_name,
        vehicle?.plate_number,
        vehicle?.vin,
      ],
      sourceHref: sourceHref(`/ai/dtc-decoder?vehicle_id=${dtc.vehicle_id}`, locale),
      sourceLabel: locale === "ar" ? "فتح DTC" : "Open DTC",
      sourceMarker: `dtc-${dtc.code}`,
      sourceNote: locale === "ar" ? "رمز عطل محفوظ" : "Stored diagnostic code",
      stopDrivingWarning: dtc.severity === "critical",
      subtitle: vehicleLabel(vehicle),
      summary,
      title,
      type: "dtc",
      vehicleId: dtc.vehicle_id,
      vehicleLabel: vehicleLabel(vehicle),
    });
  }

  for (const [index, diagnostic] of ((diagnosticsResponse.data ?? []) as DiagnosticRow[]).entries()) {
    const vehicle = vehiclesById.get(diagnostic.vehicle_id);
    const cause = diagnosisCause(diagnostic.diagnosis_json);
    const title = `${locale === "ar" ? "تشخيص" : "Diagnostic"} · ${diagnostic.severity}`;
    const summary = truncate(diagnostic.advisor_summary ?? diagnostic.customer_explanation ?? cause);
    results.push({
      createdAt: diagnostic.created_at,
      customerLabel: vehicle?.customer?.full_name ?? null,
      dateForFilter: diagnostic.created_at,
      id: `diagnostic:${diagnostic.id}`,
      safetyLevel: severityFromValue(diagnostic.severity),
      searchText: [
        title,
        summary,
        cause,
        diagnostic.advisor_summary,
        diagnostic.customer_explanation,
        diagnostic.severity,
        diagnostic.stop_driving_warning ? "stop driving safety critical" : null,
        vehicleLabel(vehicle),
        vehicle?.customer?.full_name,
        vehicle?.plate_number,
        vehicle?.vin,
      ],
      sourceHref: sourceHref(`/ai/vehicle-diagnosis?vehicle_id=${diagnostic.vehicle_id}`, locale),
      sourceLabel: locale === "ar" ? "فتح التشخيص" : "Open diagnosis",
      sourceMarker: `diagnostic-${index + 1}`,
      sourceNote: diagnostic.stop_driving_warning
        ? locale === "ar"
          ? "تحذير سلامة"
          : "Safety warning"
        : locale === "ar"
          ? "نتيجة تشخيص"
          : "Diagnostic result",
      stopDrivingWarning: diagnostic.stop_driving_warning,
      subtitle: vehicleLabel(vehicle),
      summary,
      title,
      type: "diagnostics",
      vehicleId: diagnostic.vehicle_id,
      vehicleLabel: vehicleLabel(vehicle),
    });
  }

  for (const [index, plan] of ((maintenanceResponse.data ?? []) as MaintenanceRow[]).entries()) {
    const vehicle = vehiclesById.get(plan.vehicle_id);
    const title = planTitle(plan.plan_json) ?? (locale === "ar" ? "خطة صيانة" : "Maintenance plan");
    const summary = truncate(planSummary(plan.plan_json));
    const nextService = plan.next_service_date
      ? `${locale === "ar" ? "الخدمة التالية" : "Next service"} ${plan.next_service_date}`
      : null;
    results.push({
      createdAt: plan.created_at,
      customerLabel: vehicle?.customer?.full_name ?? null,
      dateForFilter: plan.next_service_date ?? plan.created_at,
      id: `maintenance:${plan.id}`,
      safetyLevel: null,
      searchText: [
        title,
        summary,
        nextService,
        plan.next_service_mileage,
        vehicleLabel(vehicle),
        vehicle?.customer?.full_name,
        vehicle?.plate_number,
        vehicle?.vin,
      ],
      sourceHref: sourceHref(`/vehicles/${plan.vehicle_id}`, locale),
      sourceLabel: locale === "ar" ? "فتح المركبة" : "Open vehicle",
      sourceMarker: `plan-${index + 1}`,
      sourceNote: locale === "ar" ? "خطة صيانة" : "Maintenance plan",
      stopDrivingWarning: false,
      subtitle: [vehicleLabel(vehicle), nextService].filter(Boolean).join(" · "),
      summary,
      title,
      type: "maintenance",
      vehicleId: plan.vehicle_id,
      vehicleLabel: vehicleLabel(vehicle),
    });
  }

  for (const [index, call] of ((quoteDraftResponse.data ?? []) as ToolCallRow[]).entries()) {
    const quoteId = quoteIdFromOutput(call.output_json);
    if (!quoteId || !call.vehicle_id) continue;
    const vehicle = vehiclesById.get(call.vehicle_id);
    results.push({
      createdAt: call.created_at,
      customerLabel: vehicle?.customer?.full_name ?? null,
      dateForFilter: call.created_at,
      id: `quote:${call.id}`,
      safetyLevel: null,
      searchText: [
        "quote draft generator quotation",
        quoteId,
        vehicleLabel(vehicle),
        vehicle?.customer?.full_name,
        vehicle?.plate_number,
        vehicle?.vin,
      ],
      sourceHref: sourceHref(`/quotations/${quoteId}`, locale),
      sourceLabel: locale === "ar" ? "فتح عرض السعر" : "Open quotation",
      sourceMarker: `quote-${index + 1}`,
      sourceNote: locale === "ar" ? "مسودة عرض سعر من ذكاء المركبات" : "Vehicle Intelligence quote draft",
      stopDrivingWarning: call.safety_flagged,
      subtitle: vehicleLabel(vehicle),
      summary:
        locale === "ar"
          ? "تم إنشاء مسودة عرض السعر من سير عمل تشخيص المركبة."
          : "Quote draft generated from the Vehicle Intelligence diagnostic workflow.",
      title: locale === "ar" ? "مسودة عرض سعر" : "Quote draft",
      type: "quotes",
      vehicleId: call.vehicle_id,
      vehicleLabel: vehicleLabel(vehicle),
    });
  }

  const filtered = filterResults({
    dateRange: effectiveDateRange,
    query,
    results,
    safety: effectiveSafety,
    type,
  });
  const summary = buildGroundedVehicleSearchSummary({
    locale,
    query,
    results: filtered,
  }) as VehicleSearchSummary;

  const user = await getUser();
  const logVehicleId = filtered.find((result) => result.vehicleId)?.vehicleId ?? null;
  if (query && filtered.length > 0 && logVehicleId) {
    await saveAiToolCall({
      businessId: business.id,
      durationMs: Date.now() - startedAt,
      errorMessage: null,
      inputJson: {
        dateRange: effectiveDateRange,
        query,
        resultType: type,
        safety: effectiveSafety,
      },
      model: "grounded-rule-synthesis",
      outputJson: {
        citedRecords: summary.citedRecords,
        resultCount: filtered.length,
        summary: summary.text,
      },
      safetyFlagged: summary.safetyWarning,
      status: "success",
      toolName: "vehicle_intelligence_search",
      userId: user?.id ?? null,
      vehicleId: logVehicleId,
    });
  }

  return {
    error: null,
    filters: {
      dateRange: effectiveDateRange,
      query,
      safety: effectiveSafety,
      type,
    },
    resultGroups: groupResults(filtered),
    results: filtered,
    summary,
  };
}
