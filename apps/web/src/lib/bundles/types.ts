import type { BillingCycle, Currency, SlaLevel } from "@/lib/retainer/types";

export type BundleTier = "essential" | "growth" | "premium" | "custom";

export interface MembershipBundleFeature {
  label: string;
  included: boolean;
}

export interface MembershipBundleDraft {
  name: string;
  tier: BundleTier;
  description?: string;
  currency: Currency;
  billingCycle: BillingCycle;
  price: number;
  includedVisits: number;
  includedLaborHours: number;
  slaLevel: SlaLevel;
  features: MembershipBundleFeature[];
  isPublished: boolean;
  sortOrder: number;
  scenarioId?: string | null;
}

export interface MembershipBundleRecord extends MembershipBundleDraft {
  id: string;
  businessId: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
