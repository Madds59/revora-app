import { z } from "zod";

const nonNegative = z.number().min(0).finite();

export const bundleFeatureSchema = z.object({
  label: z.string().min(1).max(160),
  included: z.boolean(),
});

export const bundleDraftSchema = z.object({
  name: z.string().min(1).max(160),
  tier: z.enum(["essential", "growth", "premium", "custom"]),
  description: z.string().max(2000).optional(),
  currency: z.enum(["AED", "USD", "SAR"]),
  billingCycle: z.enum(["monthly", "quarterly", "annual"]),
  price: nonNegative,
  includedVisits: nonNegative,
  includedLaborHours: nonNegative,
  slaLevel: z.enum(["standard", "priority", "vip"]),
  features: z.array(bundleFeatureSchema).default([]),
  isPublished: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
  scenarioId: z.string().uuid().nullable().optional(),
});
export type BundleDraftInput = z.infer<typeof bundleDraftSchema>;

export const generateBundlesSchema = z.object({
  scenarioId: z.string().uuid(),
});
