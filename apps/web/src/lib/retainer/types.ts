export type Currency = "AED" | "USD" | "SAR";
export type BillingCycle = "monthly" | "quarterly" | "annual";
export type SlaLevel = "standard" | "priority" | "vip";
export type RoundingStrategy =
  | "none"
  | "nearest_10"
  | "nearest_50"
  | "nearest_100"
  | "psychological";

export interface LaborItem {
  id: string;
  role: string;
  department?: string;
  hourlyCost: number;
  estimatedHours: number;
  utilization: number;
}

export interface PartsItem {
  id: string;
  name: string;
  unitCost: number;
  quantity: number;
  markup: number;
}

export interface ToolItem {
  id: string;
  name: string;
  monthlyCost: number;
  allocation: number;
}

export interface OverheadSettings {
  rent: number;
  utilities: number;
  equipmentDepreciation: number;
  insurance: number;
  adminOverhead: number;
  miscellaneous: number;
}

export interface RiskSettings {
  reworkBuffer: number;
  emergencySupportBuffer: number;
  prioritySlaPremium: number;
  warrantyReserve: number;
  latePaymentRisk: number;
}

export interface PricingSettings {
  targetMargin: number;
  minimumMargin: number;
  desiredNetProfit?: number;
  discount: number;
  vat: number;
  rounding: RoundingStrategy;
  annualPrepayDiscount?: number;
}

export interface RetainerCalculationInput {
  currency: Currency;
  billingCycle: BillingCycle;
  contractLengthMonths: number;
  numberOfVehicles: number;
  expectedMonthlyVisits: number;
  slaLevel: SlaLevel;
  laborItems: LaborItem[];
  partsItems: PartsItem[];
  toolItems: ToolItem[];
  overhead: OverheadSettings;
  risk: RiskSettings;
  pricing: PricingSettings;
}

export interface RetainerWarning {
  code: string;
  severity: "info" | "warning" | "critical";
}

export interface RetainerRecommendation {
  code: string;
  tone: "positive" | "neutral" | "warning";
}

export interface RetainerCalculationResult {
  ok: boolean;
  error?: string;
  currency: Currency;
  laborCost: number;
  internalPartsCost: number;
  billablePartsRevenue: number;
  allocatedToolCost: number;
  overheadCost: number;
  riskBufferAmount: number;
  baseMonthlyCost: number;
  preTaxRetainer: number;
  discountAmount: number;
  subtotalAfterDiscount: number;
  vatAmount: number;
  finalMonthlyRetainerRaw: number;
  finalMonthlyRetainer: number;
  grossProfit: number;
  grossMargin: number;
  breakEvenPrice: number;
  annualContractValue: number;
  totalContractValue: number;
  pricePerVehicle: number;
  pricePerVisit: number;
  warnings: RetainerWarning[];
  recommendations: RetainerRecommendation[];
}

export interface RetainerScenarioInput {
  title: string;
  description?: string;
  customerId?: string;
  customerType: "individual" | "fleet" | "corporate" | "government" | "insurance_partner";
  serviceCategory:
    | "general_workshop_maintenance"
    | "detailing"
    | "tire_services"
    | "inspection_package"
    | "fleet_maintenance"
    | "custom";
  input: RetainerCalculationInput;
}

export interface RetainerScenarioRecord extends RetainerScenarioInput {
  id: string;
  businessId: string;
  quoteId: string | null;
  createdBy: string | null;
  status: "draft" | "active" | "archived" | "converted_to_quote";
  calculatedResults: RetainerCalculationResult;
  createdAt: string;
  updatedAt: string;
}

export interface RetainerComparison {
  baseScenarioId: string;
  scenarioIds: string[];
  totalMonthlySpread: number;
  marginSpread: number;
  recommendations: string[];
}
