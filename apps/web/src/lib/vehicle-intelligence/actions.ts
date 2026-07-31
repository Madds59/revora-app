"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getUser, requireCustomerPortal, requireMembership } from "@/lib/auth";
import { canManageCustomers, canManageQuotes } from "@/lib/permissions";

import {
  analyzeVehicleSymptoms,
  createQuoteDraftFromDiagnosis,
  decodeVinForVehicle,
  enrichVehicleMetadataWithVin,
  getVehiclePortalSnapshot,
  loadVehicleBusinessContext,
  saveAiToolCall,
  saveDtcCodes,
  saveMaintenancePlan,
} from "./service";
import {
  interpretDtcCodes,
  validateDtcCodes,
} from "./dtc.js";
import { validateVin } from "./vin.js";
import { buildFallbackMaintenancePlan, buildFallbackDiagnostic } from "./service";
import { createClient } from "@/lib/supabase/server";
import { firstValidationMessage } from "@/lib/validation/common";
import {
  buildVehicleMediaPath,
  parseOwnedVehicleMediaPath,
  vehicleMediaUploadSchema,
  VEHICLE_MEDIA_BUCKET,
} from "@/lib/validation/vehicle-media";
import type { VehicleDtcInterpretation, VehicleVinDecode } from "./types";

// Same response for a missing vehicle, another tenant's vehicle, a mismatched
// customer, and an unprovable path — none of these may be distinguishable.
const VEHICLE_MEDIA_UNAVAILABLE = "Vehicle media target not found or unavailable.";

export type FormState<T = unknown> = {
  error?: string;
  message?: string;
  result?: T;
};

export type VinDecoderState = FormState<{
  decode: Awaited<ReturnType<typeof decodeVinForVehicle>>["decode"];
  validation: Awaited<ReturnType<typeof decodeVinForVehicle>>["validation"];
}>;

export type DiagnosisState = FormState<{
  aiUsed: boolean;
  advisorSummary: string;
  customerExplanation: string;
  diagnosticResultId: string | null;
  diagnostic: ReturnType<typeof buildFallbackDiagnostic>;
  maintenancePlan: Awaited<ReturnType<typeof buildFallbackMaintenancePlan>>;
  quoteDraftEligible: boolean;
  reportId: string;
  vehicleId: string;
}>;

export type DtcDecoderState = FormState<{
  codes: ReturnType<typeof interpretDtcCodes>;
  storedCount: number;
  vehicleId: string | null;
}>;

export type MaintenanceState = FormState<{
  maintenancePlan: Awaited<ReturnType<typeof buildFallbackMaintenancePlan>>;
  maintenancePlanId: string | null;
  vehicleId: string;
}>;

export type QuoteDraftState = FormState<{
  quoteId: string;
  quoteSuggestions: Array<{
    name: string;
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
  vehicleId: string;
}>;

export type VehicleMediaState = FormState<{
  count: number;
  vehicleId: string;
}>;

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  const value = str(formData, key);
  return value === "" ? null : value;
}

function splitList(value: string) {
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function parseMileage(value: string): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeVehicleId(value: string) {
  return value === "__none__" ? "" : value;
}

function quoteSuggestionsFromDiagnostic(diagnostic: { possibleCauses: { cause: string; explanation: string }[]; suggestedServiceCategory: string; }) {
  const topCause = diagnostic.possibleCauses[0];
  return [
    {
      name: diagnostic.suggestedServiceCategory,
      description: topCause
        ? topCause.explanation
        : "Inspect the vehicle and confirm the root cause before authorizing repairs.",
      quantity: 1,
      unitPrice: 0,
    },
  ];
}

export async function decodeVinAction(
  _prev: VinDecoderState,
  formData: FormData,
): Promise<VinDecoderState> {
  const vin = str(formData, "vin");
  const vehicleId = normalizeVehicleId(str(formData, "vehicle_id"));
  const { member, business } = await requireMembership();
  if (!vin) return { error: "VIN is required." };

  const validation = validateVin(vin);
  const decoded = await decodeVinForVehicle({ vehicleId: vehicleId ?? "", vin });
  const user = await getUser();

  if (vehicleId && canManageCustomers(member.role) && validation.ok) {
    await enrichVehicleMetadataWithVin({
      vehicleId,
      decode: decoded.decode as VehicleVinDecode,
    });
  }

  await saveAiToolCall({
    businessId: business.id,
    userId: user?.id ?? null,
    vehicleId: vehicleId ?? null,
    toolName: "vin_decoder",
    inputJson: { vin, vehicleId },
    outputJson: decoded.decode,
    model: null,
    status: "success",
    errorMessage: null,
    safetyFlagged: false,
    durationMs: null,
  });

  return {
    message: validation.ok ? "VIN decoded." : validation.error,
    result: decoded,
  };
}

async function runDiagnosis({
  businessId,
  customerId,
  source,
  submittedByType,
  vehicleId,
  symptoms,
  symptomTags,
  mileage,
  drivingCondition,
  warningLights,
  severityInput,
  generatedBy,
}: {
  businessId: string;
  customerId: string | null;
  drivingCondition: string | null;
  generatedBy: string | null;
  mileage: number | null;
  severityInput: string | null;
  source: "portal" | "dashboard";
  submittedByType: "customer" | "staff" | "owner" | "system";
  symptomTags: string[];
  symptoms: string;
  vehicleId: string;
  warningLights: string[];
}) {
  return analyzeVehicleSymptoms({
    businessId,
    customerId,
    drivingCondition,
    generatedBy,
    mileage,
    severityInput,
    source,
    submittedBy: generatedBy ?? "",
    submittedByType,
    symptomTags,
    symptoms,
    vehicleId,
    warningLights,
  });
}

export async function submitDiagnosisAction(
  _prev: DiagnosisState,
  formData: FormData,
): Promise<DiagnosisState> {
  const { member, business } = await requireMembership();
  if (!canManageCustomers(member.role)) {
    return { error: "You don't have permission to run diagnostics." };
  }

  const vehicleId = normalizeVehicleId(str(formData, "vehicle_id"));
  const symptoms = str(formData, "symptoms");
  if (!vehicleId || !symptoms) return { error: "Vehicle and symptoms are required." };

  const symptomTags = splitList(str(formData, "symptom_tags"));
  const warningLights = splitList(str(formData, "warning_lights"));
  const mileage = parseMileage(str(formData, "mileage"));
  const drivingCondition = optional(formData, "driving_condition");
  const severityInput = optional(formData, "severity_input");
  const generatedBy = (await getUser())?.id ?? null;
  const submittedByType = member.role === "business_owner" ? "owner" : member.role === "employee" ? "staff" : "staff";

  const result = await runDiagnosis({
    businessId: business.id,
    customerId: optional(formData, "customer_id"),
    source: "dashboard",
    submittedByType,
    vehicleId,
    symptoms,
    symptomTags,
    mileage,
    drivingCondition,
    warningLights,
    severityInput,
    generatedBy,
  });

  if (result.error || !result.data) {
    return { error: result.error ?? "Could not analyze the vehicle." };
  }

  const maintenancePlan = result.data.maintenancePlan;
  return {
    message: "Diagnosis saved.",
    result: {
      aiUsed: result.data.aiUsed,
      advisorSummary: result.data.advisorSummary,
      customerExplanation: result.data.customerExplanation,
      diagnosticResultId: result.data.diagnosticResult?.id ?? null,
      diagnostic: result.data.diagnostic,
      maintenancePlan,
      quoteDraftEligible: result.data.diagnostic.quoteDraftEligible,
      reportId: result.data.report.id,
      vehicleId,
    },
  };
}

export async function submitPortalHealthCheckAction(
  _prev: DiagnosisState,
  formData: FormData,
): Promise<DiagnosisState> {
  const { accounts } = await requireCustomerPortal();
  const vehicleId = normalizeVehicleId(str(formData, "vehicle_id"));
  const symptoms = str(formData, "symptoms");
  if (!vehicleId || !symptoms) return { error: "Vehicle and symptoms are required." };

  const customerId = optional(formData, "customer_id");
  const linkedAccount = accounts.find((account) => account.id === customerId) ?? accounts[0] ?? null;
  if (!linkedAccount) {
    return { error: "No linked customer account is available." };
  }

  const vehicleAccess = await getVehiclePortalSnapshot(vehicleId);
  if (vehicleAccess.error || !vehicleAccess.data) {
    return { error: vehicleAccess.error ?? "Vehicle is not available." };
  }

  if (vehicleAccess.data.customerId !== linkedAccount.id) {
    return { error: "This vehicle is not linked to your customer account." };
  }

  const generatedBy = (await getUser())?.id ?? null;
  const result = await runDiagnosis({
    businessId: vehicleAccess.data.businessId,
    customerId: linkedAccount.id,
    source: "portal",
    submittedByType: "customer",
    vehicleId,
    symptoms,
    symptomTags: splitList(str(formData, "symptom_tags")),
    mileage: parseMileage(str(formData, "mileage")),
    drivingCondition: optional(formData, "driving_condition"),
    warningLights: splitList(str(formData, "warning_lights")),
    severityInput: optional(formData, "severity_input"),
    generatedBy,
  });

  if (result.error || !result.data) {
    return { error: result.error ?? "Could not analyze the vehicle." };
  }

  return {
    message: "Health check submitted.",
    result: {
      aiUsed: result.data.aiUsed,
      advisorSummary: result.data.advisorSummary,
      customerExplanation: result.data.customerExplanation,
      diagnosticResultId: result.data.diagnosticResult?.id ?? null,
      diagnostic: result.data.diagnostic,
      maintenancePlan: result.data.maintenancePlan,
      quoteDraftEligible: result.data.diagnostic.quoteDraftEligible,
      reportId: result.data.report.id,
      vehicleId,
    },
  };
}

export async function interpretDtcAction(
  _prev: DtcDecoderState,
  formData: FormData,
): Promise<DtcDecoderState> {
  const { member, business } = await requireMembership();
  if (!canManageCustomers(member.role)) {
    return { error: "You don't have permission to decode DTCs." };
  }

  const codes = validateDtcCodes(splitList(str(formData, "codes")));
  if (codes.length === 0) return { error: "Enter at least one valid diagnostic code." };

  const vehicleId = normalizeVehicleId(optional(formData, "vehicle_id") ?? "");
  const interpreted = interpretDtcCodes(codes) as VehicleDtcInterpretation[];
  const user = await getUser();

  if (vehicleId) {
    await saveDtcCodes({
      businessId: business.id,
      vehicleId,
      diagnosticResultId: optional(formData, "diagnostic_result_id"),
      codes: interpreted.map((entry) => ({
        code: entry.code,
        system: entry.system,
        title: entry.title,
        description: entry.description,
        severity: entry.severity,
        source: entry.source,
      })),
    });
  }

  await saveAiToolCall({
    businessId: business.id,
    userId: user?.id ?? null,
    vehicleId: vehicleId ?? null,
    toolName: "dtc_decoder",
    inputJson: { codes, vehicleId },
    outputJson: interpreted,
    model: null,
    status: "success",
    errorMessage: null,
    safetyFlagged: interpreted.some((entry) => entry.stopDrivingWarning),
    durationMs: null,
  });

  return {
    message: "Diagnostic codes decoded.",
    result: {
      codes: interpreted,
      storedCount: interpreted.length,
      vehicleId,
    },
  };
}

export async function generateMaintenanceAction(
  _prev: MaintenanceState,
  formData: FormData,
): Promise<MaintenanceState> {
  const { member, business } = await requireMembership();
  if (!canManageCustomers(member.role)) {
    return { error: "You don't have permission to generate maintenance plans." };
  }

  const vehicleId = normalizeVehicleId(str(formData, "vehicle_id"));
  if (!vehicleId) return { error: "Vehicle is required." };

  const context = await loadVehicleBusinessContext(vehicleId);
  if (context.error || !context.data) {
    return { error: context.error ?? "Vehicle not found." };
  }

  const diagnosis = buildFallbackDiagnostic({
    symptoms: str(formData, "symptoms") || "Routine maintenance review",
    drivingCondition: optional(formData, "driving_condition"),
    mileage: parseMileage(str(formData, "mileage")),
    severityInput: optional(formData, "severity_input"),
    warningLights: splitList(str(formData, "warning_lights")),
    vin: context.data.vehicle.vin
      ? ((await decodeVinForVehicle({ vehicleId, vin: context.data.vehicle.vin })).decode as VehicleVinDecode)
      : null,
  });
  const plan = buildFallbackMaintenancePlan({
    diagnosis,
    mileage: parseMileage(str(formData, "mileage")),
    vehicle: context.data.vehicle,
  });
  const saved = await saveMaintenancePlan({
    businessId: business.id,
    generatedBy: (await getUser())?.id ?? null,
    plan,
    vehicleId,
  });

  if (saved.error || !saved.data) {
    return { error: saved.error ?? "Could not save maintenance plan." };
  }

  return {
    message: "Maintenance plan saved.",
    result: {
      maintenancePlan: plan,
      maintenancePlanId: saved.data.id,
      vehicleId,
    },
  };
}

export async function generateQuoteDraftAction(formData: FormData): Promise<void> {
  const { member, business } = await requireMembership();
  if (!canManageQuotes(member.role)) {
    return;
  }

  const diagnosticResultId = str(formData, "diagnostic_result_id");
  if (!diagnosticResultId) return;

  const supabase = await createClient();
  const { data: resultRow, error } = await supabase
    .from("vehicle_diagnostic_results")
    .select("id, business_id, vehicle_id, quote_draft_eligible, diagnosis_json")
    .eq("id", diagnosticResultId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (error) return;
  if (!resultRow) return;
  if (!resultRow.quote_draft_eligible) {
    return;
  }

  const { data: vehicleRow } = await supabase
    .from("vehicles")
    .select("id, customer_id")
    .eq("id", resultRow.vehicle_id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!vehicleRow?.customer_id) return;

  const quote = await createQuoteDraftFromDiagnosis({
    businessId: business.id,
    customerId: vehicleRow.customer_id,
    userId: (await getUser())?.id ?? "",
    vehicleId: resultRow.vehicle_id,
  });

  if (quote.error || !quote.data) return;

  const diagnosis = resultRow.diagnosis_json as {
    possibleCauses?: Array<{ cause: string; explanation: string }>;
    suggestedServiceCategory?: string;
  };

  const quoteSuggestions = quoteSuggestionsFromDiagnostic({
    possibleCauses: diagnosis.possibleCauses ?? [],
    suggestedServiceCategory: diagnosis.suggestedServiceCategory ?? "Inspection",
  });

  await saveAiToolCall({
    businessId: business.id,
    userId: (await getUser())?.id ?? null,
    vehicleId: resultRow.vehicle_id,
    toolName: "quote_draft_generator",
    inputJson: { diagnosticResultId },
    outputJson: { quoteId: quote.data, quoteSuggestions },
    model: null,
    status: "success",
    errorMessage: null,
    safetyFlagged: false,
    durationMs: null,
  });

  redirect(`/quotations/${quote.data}`);
}

export async function uploadVehicleMediaAction(
  _prev: VehicleMediaState,
  formData: FormData,
): Promise<VehicleMediaState> {
  const user = await getUser();
  const { member, business } = await requireMembership();
  if (!canManageCustomers(member.role)) {
    return { error: "You don't have permission to upload vehicle media." };
  }

  // 1. Validate every client value before anything else touches the database.
  //    `storage_bucket` is intentionally not read: the client posts one, and it
  //    is ignored in favour of the server constant.
  const parsed = vehicleMediaUploadSchema.safeParse({
    vehicleId: formData.get("vehicle_id"),
    customerId: formData.get("customer_id"),
    objectPath: formData.get("object_path"),
    fileName: formData.get("file_name"),
    mimeType: formData.get("mime_type"),
    sizeBytes: formData.get("size_bytes"),
    mediaType: formData.get("media_type"),
    description: formData.get("description"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  // 2. The vehicle id is only a selector — resolve it under the authenticated
  //    business so a member of one tenant cannot record media against another's
  //    vehicle. The row is also the authority for the customer relationship.
  const supabase = await createClient();
  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("id, business_id, customer_id")
    .eq("id", v.vehicleId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (vehicleError) {
    console.error("uploadVehicleMediaAction lookup failed", vehicleError.code);
    return { error: "Could not record media upload." };
  }
  if (!vehicle) return { error: VEHICLE_MEDIA_UNAVAILABLE };

  // 3. A submitted customer id may only confirm the vehicle's real customer; it
  //    can never create or redirect the link.
  if (v.customerId && v.customerId !== vehicle.customer_id) {
    return { error: VEHICLE_MEDIA_UNAVAILABLE };
  }

  // 4. Pin the Storage path to the verified business AND vehicle, then persist
  //    the canonical rebuild rather than the raw client string.
  const ownedPath = parseOwnedVehicleMediaPath(v.objectPath, {
    businessId: business.id,
    vehicleId: vehicle.id,
  });
  if (!ownedPath) return { error: VEHICLE_MEDIA_UNAVAILABLE };

  const { data, error } = await supabase
    .from("vehicle_media_uploads")
    .insert({
      business_id: business.id,
      vehicle_id: vehicle.id,
      // Authoritative relationship from the verified vehicle row, not the client.
      customer_id: vehicle.customer_id,
      uploaded_by: user?.id ?? "",
      // Server-selected bucket; the posted value is never trusted.
      storage_bucket: VEHICLE_MEDIA_BUCKET,
      storage_path: buildVehicleMediaPath(ownedPath),
      media_type: v.mediaType as "image" | "video" | "document" | "audio" | "other",
      description: v.description ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    // Code only: paths and filenames may carry customer-supplied text.
    if (error) console.error("recordVehicleMediaUpload failed", error.code);
    return { error: "Could not record media upload." };
  }

  revalidatePath(`/vehicles/${vehicle.id}`);
  revalidatePath("/vehicles");

  await saveAiToolCall({
    businessId: business.id,
    userId: user?.id ?? null,
    vehicleId: vehicle.id,
    toolName: "vehicle_media_upload",
    inputJson: {
      fileName: v.fileName,
      mimeType: v.mimeType,
      sizeBytes: v.sizeBytes,
      mediaType: v.mediaType,
    },
    outputJson: { id: data.id },
    model: null,
    status: "success",
    errorMessage: null,
    safetyFlagged: false,
    durationMs: null,
  });

  return {
    message: "Media uploaded.",
    result: {
      count: 1,
      vehicleId: vehicle.id,
    },
  };
}
