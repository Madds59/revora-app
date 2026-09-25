/**
 * Optional modules only. Anything not named here is always enabled — keeping
 * the registry small keeps the phase 2 re-enablement diff honest.
 */
export type FeatureKey =
  | "vehicleIntelligence"
  | "retainerCalculator"
  | "membershipBundles"
  | "analytics"
  | "maintenance"
  | "feedback";

export type FeatureFlags = Record<FeatureKey, boolean>;
