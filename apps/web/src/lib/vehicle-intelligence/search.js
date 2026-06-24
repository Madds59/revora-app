import { z } from "zod";

export const VEHICLE_SEARCH_TYPES = [
  "all",
  "vehicles",
  "symptoms",
  "dtc",
  "diagnostics",
  "maintenance",
  "quotes",
];

export const VEHICLE_SEARCH_DATE_RANGES = [
  "all",
  "7d",
  "30d",
  "this_month",
  "next_30d",
];

export const VEHICLE_SEARCH_SAFETY_LEVELS = [
  "all",
  "low",
  "medium",
  "high",
  "critical",
  "stop_driving",
];

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

const inputSchema = z.object({
  dateRange: z.enum(VEHICLE_SEARCH_DATE_RANGES).default("all"),
  locale: z.enum(["en", "ar"]).default("en"),
  query: z.string().trim().max(160).default(""),
  safety: z.enum(VEHICLE_SEARCH_SAFETY_LEVELS).default("all"),
  type: z.enum(VEHICLE_SEARCH_TYPES).default("all"),
});

const STOP_WORDS = new Set([
  "a",
  "about",
  "all",
  "any",
  "are",
  "car",
  "cars",
  "case",
  "cases",
  "find",
  "for",
  "from",
  "has",
  "have",
  "in",
  "is",
  "list",
  "me",
  "month",
  "need",
  "needs",
  "recent",
  "record",
  "records",
  "report",
  "reports",
  "search",
  "show",
  "summarize",
  "symptom",
  "symptoms",
  "that",
  "the",
  "this",
  "to",
  "vehicle",
  "vehicles",
  "week",
  "which",
  "with",
]);

function normalizeQuery(query) {
  return String(query ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
}

export function parseVehicleSearchInput(input) {
  return inputSchema.safeParse({
    dateRange: input?.dateRange || "all",
    locale: input?.locale === "ar" ? "ar" : "en",
    query: normalizeQuery(input?.query),
    safety: input?.safety || "all",
    type: input?.type || "all",
  });
}

export function redactUuidText(value, replacement = "record") {
  return String(value ?? "").replace(UUID_PATTERN, replacement);
}

export function containsUuid(value) {
  UUID_PATTERN.lastIndex = 0;
  return UUID_PATTERN.test(String(value ?? ""));
}

export function getSearchTokens(query) {
  return normalizeQuery(query)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

export function deriveVehicleSearchHints(query) {
  const normalized = normalizeQuery(query).toLowerCase();
  return {
    dateRange:
      /\b(this month|maintenance this month|due this month)\b/.test(normalized)
        ? "this_month"
        : /\b(next 30|next month|due soon)\b/.test(normalized)
          ? "next_30d"
          : /\b(this week|last week|recent|safety-critical reports this week)\b/.test(normalized)
            ? "7d"
            : "all",
    safety:
      /\b(stop driving|unsafe|safety critical|safety-critical|critical)\b/.test(normalized)
        ? "stop_driving"
        : "all",
    type:
      /\bp[0-9a-f]{4}\b/i.test(normalized)
        ? "dtc"
        : /\bmaintenance|service due|next service\b/.test(normalized)
          ? "maintenance"
          : /\bsymptom|overheat|overheating|smoke|noise|rough idle|brake|warning\b/.test(normalized)
            ? "symptoms"
            : "all",
  };
}

export function matchesSearchText(fields, query) {
  const tokens = getSearchTokens(query);
  if (tokens.length === 0) return true;
  const haystack = fields
    .map((field) => (field == null ? "" : String(field)))
    .join(" ")
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function startOfToday(now) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function isRecordInDateRange(value, dateRange, now = new Date()) {
  if (dateRange === "all") return true;
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const today = startOfToday(now);
  if (dateRange === "7d") {
    const start = new Date(today);
    start.setDate(start.getDate() - 7);
    return date >= start;
  }
  if (dateRange === "30d") {
    const start = new Date(today);
    start.setDate(start.getDate() - 30);
    return date >= start;
  }
  if (dateRange === "this_month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return date >= start && date < end;
  }
  if (dateRange === "next_30d") {
    const end = new Date(today);
    end.setDate(end.getDate() + 30);
    return date >= today && date <= end;
  }
  return true;
}

export function isUnsafeRepairRequest(query) {
  const normalized = normalizeQuery(query).toLowerCase();
  return /\b(disable|bypass|remove|delete|override|drive anyway|ignore)\b/.test(normalized) &&
    /\b(brake|airbag|abs|coolant|fuel|battery|warning|sensor|safety)\b/.test(normalized);
}

export function buildGroundedVehicleSearchSummary({
  query,
  results,
  locale = "en",
}) {
  const safeResults = Array.isArray(results) ? results : [];
  const unsafe = isUnsafeRepairRequest(query);
  if (safeResults.length === 0) {
    return {
      citedRecords: [],
      dataInsufficient: true,
      safetyWarning: unsafe,
      text:
        locale === "ar"
          ? "لا توجد سجلات داخلية كافية للإجابة على هذا البحث. لم تتم إضافة أي مواصفات أو استنتاجات خارجية."
          : "There is not enough internal record data to answer this search. No external specifications or unsupported conclusions were added.",
    };
  }

  const criticalCount = safeResults.filter(
    (result) => result.stopDrivingWarning || result.safetyLevel === "critical",
  ).length;
  const citedRecords = safeResults.slice(0, 4).map((result) => ({
    sourceMarker: result.sourceMarker,
    title: redactUuidText(result.title, "record"),
    type: result.type,
  }));
  const citedText = citedRecords
    .map((record) => `${record.sourceMarker}: ${record.title}`)
    .join("; ");

  const text =
    locale === "ar"
      ? [
          `تم العثور على ${safeResults.length} سجل داخلي مطابق.`,
          criticalCount > 0
            ? `${criticalCount} سجل يتضمن تحذير سلامة أو أولوية حرجة.`
            : "لا توجد نتيجة مطابقة تحمل تحذير إيقاف قيادة.",
          `المصادر: ${citedText}.`,
          unsafe
            ? "لا تقدم Revora تعليمات تعطيل أو تجاوز لأنظمة السلامة. استخدم النتائج لتوجيه فحص ورشة مؤهل فقط."
            : "الملخص مبني فقط على سجلات Revora الداخلية المسترجعة.",
        ].join(" ")
      : [
          `${safeResults.length} matching internal record${safeResults.length === 1 ? "" : "s"} found.`,
          criticalCount > 0
            ? `${criticalCount} record${criticalCount === 1 ? "" : "s"} include a safety warning or critical priority.`
            : "No matching result carries a stop-driving warning.",
          `Sources: ${citedText}.`,
          unsafe
            ? "Revora will not provide instructions to disable or bypass safety systems. Use these records to guide qualified workshop inspection only."
            : "This summary is grounded only in the retrieved Revora records.",
        ].join(" ");

  return {
    citedRecords,
    dataInsufficient: false,
    safetyWarning: unsafe || criticalCount > 0,
    text: redactUuidText(text, "record"),
  };
}
