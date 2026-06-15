export type VehicleIntelligenceSeverity = "low" | "medium" | "high" | "critical";

export type VehicleIntelligenceSource = "portal" | "dashboard";
export type VehicleSubmittedByType = "customer" | "staff" | "owner" | "system";
export type VehicleDtcSource = "manual" | "obd_upload" | "ai" | "verified_database";

export type VehicleDiagnosisCause = {
  cause: string;
  confidence: number;
  explanation: string;
};

export type VehicleDiagnosticJson = {
  severity: VehicleIntelligenceSeverity;
  stopDrivingWarning: boolean;
  possibleCauses: VehicleDiagnosisCause[];
  recommendedActions: string[];
  safeSelfCheckSteps: string[];
  workshopRequired: boolean;
  suggestedServiceCategory: string;
  estimatedInspectionMinutes: number;
  quoteDraftEligible: boolean;
  followUpQuestions: string[];
};

export type VehicleSafetyAssessment = {
  severity: VehicleIntelligenceSeverity;
  stopDrivingWarning: boolean;
  workshopRequired: boolean;
  quoteDraftEligible: boolean;
  matchedTerms: string[];
  reason: string;
};

export type VehicleMaintenancePlanItem = {
  title: string;
  interval: string;
  rationale: string;
  priority: "low" | "medium" | "high";
};

export type VehicleMaintenancePlan = {
  title: string;
  summary: string;
  items: VehicleMaintenancePlanItem[];
  nextServiceDate: string | null;
  nextServiceMileage: number | null;
  advisorReviewRequired: boolean;
};

export type VehicleVinDecode = {
  vin: string;
  valid: boolean;
  status: "decoded" | "invalid" | "unavailable";
  decodeSource: "nhtsa" | "unknown";
  make: string | null;
  model: string | null;
  year: number | null;
  trim: string | null;
  bodyClass: string | null;
  engine: string | null;
  fuelType: string | null;
  driveType: string | null;
  transmission: string | null;
  plantCountry: string | null;
  plantState: string | null;
  plantCity: string | null;
  manufacturer: string | null;
  raw: Record<string, string | null>;
  notes: string[];
};

export type VehicleDtcInterpretation = {
  code: string;
  system: string | null;
  title: string;
  description: string;
  severity: VehicleIntelligenceSeverity;
  source: VehicleDtcSource;
  confidence: number;
  explanation: string;
  recommendedActions: string[];
  workshopRequired: boolean;
  stopDrivingWarning: boolean;
};

export type VehicleSymptomReportInput = {
  vehicleId: string;
  symptoms: string;
  symptomTags: string[];
  mileage: number | null;
  drivingCondition: string | null;
  warningLights: string[];
  severityInput: string | null;
  source: VehicleIntelligenceSource;
};

export type VehicleSymptomReportWrite = VehicleSymptomReportInput & {
  businessId: string;
  customerId: string | null;
  submittedBy: string;
  submittedByType: VehicleSubmittedByType;
};

export type VehiclePortalSnapshot = {
  vehicleId: string;
  businessId: string;
  businessName: string;
  customerId: string;
  customerName: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  plateNumber: string | null;
  vin: string | null;
  color: string | null;
  latestReportId: string | null;
  latestReportStatus: string | null;
  latestReportCreatedAt: string | null;
  latestReportSymptoms: string | null;
  latestReportSeverityInput: string | null;
  latestDiagnosticId: string | null;
  latestDiagnosticSeverity: VehicleIntelligenceSeverity | null;
  stopDrivingWarning: boolean;
  workshopRequired: boolean;
  customerExplanation: string | null;
  latestPlanId: string | null;
  nextServiceDate: string | null;
  nextServiceMileage: number | null;
  mediaCount: number;
};

export type AiToolCallStatus = "success" | "error" | "blocked";

export type AiToolCallEntry = {
  businessId: string | null;
  userId: string | null;
  vehicleId: string | null;
  toolName: string;
  inputJson: unknown;
  outputJson: unknown | null;
  model: string | null;
  status: AiToolCallStatus;
  errorMessage: string | null;
  safetyFlagged: boolean;
  durationMs: number | null;
};

export type VehicleIntelligenceResult = {
  diagnosis: VehicleDiagnosticJson;
  safety: VehicleSafetyAssessment;
  maintenancePlan: VehicleMaintenancePlan;
  model: string | null;
  rawOutput: unknown;
  aiUsed: boolean;
};
