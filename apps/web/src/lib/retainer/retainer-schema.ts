import { z } from "zod";

const fraction = z.number().min(0).max(1);
const nonNeg = z.number().min(0).finite();
const positiveInt = z.number().int().positive();

export const laborItemSchema = z.object({
  id: z.string(),
  role: z.string().min(1),
  department: z.string().optional(),
  hourlyCost: nonNeg,
  estimatedHours: nonNeg,
  utilization: fraction,
});

export const partsItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  unitCost: nonNeg,
  quantity: nonNeg,
  markup: z.number().min(0).finite(),
});

export const toolItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  monthlyCost: nonNeg,
  allocation: fraction,
});

export const overheadSchema = z.object({
  rent: nonNeg,
  utilities: nonNeg,
  equipmentDepreciation: nonNeg,
  insurance: nonNeg,
  adminOverhead: nonNeg,
  miscellaneous: nonNeg,
});

export const riskSchema = z.object({
  reworkBuffer: fraction,
  emergencySupportBuffer: fraction,
  prioritySlaPremium: fraction,
  warrantyReserve: fraction,
  latePaymentRisk: fraction,
});

export const pricingSchema = z.object({
  targetMargin: z.number().min(0).lt(1),
  minimumMargin: z.number().min(0).lt(1),
  desiredNetProfit: nonNeg.optional(),
  discount: fraction,
  vat: fraction.default(0.05),
  rounding: z.enum(["none", "nearest_10", "nearest_50", "nearest_100", "psychological"]),
  annualPrepayDiscount: fraction.optional(),
});

export const retainerInputSchema = z.object({
  currency: z.enum(["AED", "USD", "SAR"]),
  billingCycle: z.enum(["monthly", "quarterly", "annual"]),
  contractLengthMonths: positiveInt,
  numberOfVehicles: positiveInt,
  expectedMonthlyVisits: nonNeg,
  slaLevel: z.enum(["standard", "priority", "vip"]),
  laborItems: z.array(laborItemSchema),
  partsItems: z.array(partsItemSchema),
  toolItems: z.array(toolItemSchema),
  overhead: overheadSchema,
  risk: riskSchema,
  pricing: pricingSchema,
});

export type RetainerInput = z.infer<typeof retainerInputSchema>;

export const retainerScenarioSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  customerId: z.string().uuid().optional(),
  customerType: z.enum([
    "individual",
    "fleet",
    "corporate",
    "government",
    "insurance_partner",
  ]),
  serviceCategory: z.enum([
    "general_workshop_maintenance",
    "detailing",
    "tire_services",
    "inspection_package",
    "fleet_maintenance",
    "custom",
  ]),
  input: retainerInputSchema,
});

export type RetainerScenarioInput = z.infer<typeof retainerScenarioSchema>;

export const retainerScenarioSaveSchema = retainerScenarioSchema.extend({
  id: z.string().uuid().optional(),
  status: z.enum(["draft", "active", "archived", "converted_to_quote"]).optional(),
});

export type RetainerScenarioSaveInput = z.infer<typeof retainerScenarioSaveSchema>;

export const retainerScenarioIdSchema = z.object({
  id: z.string().uuid(),
});

export const retainerScenarioIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(2).max(6),
});
