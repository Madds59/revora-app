import { z } from "zod";

export const vehicleDiagnosisCauseSchema = z.object({
  cause: z.string().min(1).max(200),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1).max(500),
});

export const vehicleDiagnosticJsonSchema = z.object({
  severity: z.enum(["low", "medium", "high", "critical"]),
  stopDrivingWarning: z.boolean(),
  possibleCauses: z.array(vehicleDiagnosisCauseSchema).max(5),
  recommendedActions: z.array(z.string().min(1).max(180)).max(8),
  safeSelfCheckSteps: z.array(z.string().min(1).max(220)).max(6),
  workshopRequired: z.boolean(),
  suggestedServiceCategory: z.string().min(1).max(120),
  estimatedInspectionMinutes: z.number().int().min(5).max(240),
  quoteDraftEligible: z.boolean(),
  followUpQuestions: z.array(z.string().min(1).max(180)).max(6),
});

export const vehicleMaintenanceItemSchema = z.object({
  title: z.string().min(1).max(120),
  interval: z.string().min(1).max(120),
  rationale: z.string().min(1).max(300),
  priority: z.enum(["low", "medium", "high"]),
});

export const vehicleMaintenancePlanSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(500),
  items: z.array(vehicleMaintenanceItemSchema).max(8),
  nextServiceDate: z.string().datetime({ offset: true }).nullable(),
  nextServiceMileage: z.number().int().nonnegative().nullable(),
  advisorReviewRequired: z.boolean(),
});

export const vinDecodeSchema = z.object({
  vin: z.string(),
  valid: z.boolean(),
  status: z.enum(["decoded", "invalid", "unavailable"]),
  decodeSource: z.enum(["nhtsa", "unknown"]),
  make: z.string().nullable(),
  model: z.string().nullable(),
  year: z.number().int().nullable(),
  trim: z.string().nullable(),
  bodyClass: z.string().nullable(),
  engine: z.string().nullable(),
  fuelType: z.string().nullable(),
  driveType: z.string().nullable(),
  transmission: z.string().nullable(),
  plantCountry: z.string().nullable(),
  plantState: z.string().nullable(),
  plantCity: z.string().nullable(),
  manufacturer: z.string().nullable(),
  raw: z.record(z.string(), z.string().nullable()),
  notes: z.array(z.string().min(1).max(220)),
});

export const dtcInterpretationSchema = z.object({
  code: z.string().regex(/^[PBCU][0-9]{4}$/),
  system: z.string().nullable(),
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(400),
  severity: z.enum(["low", "medium", "high", "critical"]),
  source: z.enum(["manual", "obd_upload", "ai", "verified_database"]),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1).max(500),
  recommendedActions: z.array(z.string().min(1).max(180)).max(6),
  workshopRequired: z.boolean(),
  stopDrivingWarning: z.boolean(),
});

export const aiToolCallStatusSchema = z.enum(["success", "error", "blocked"]);

export function validateDiagnosticJson(output) {
  const parsed = vehicleDiagnosticJsonSchema.safeParse(output);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  return { ok: true, data: parsed.data };
}

export function validateMaintenancePlan(output) {
  const parsed = vehicleMaintenancePlanSchema.safeParse(output);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  return { ok: true, data: parsed.data };
}

export function validateVinDecode(output) {
  const parsed = vinDecodeSchema.safeParse(output);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  return { ok: true, data: parsed.data };
}

export function validateDtcInterpretation(output) {
  const parsed = dtcInterpretationSchema.safeParse(output);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  return { ok: true, data: parsed.data };
}
