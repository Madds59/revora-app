// @ts-check

import { generateScenarioTiers } from "../retainer/tiers.js";

/**
 * @typedef {import("../retainer/types").RetainerScenarioRecord} RetainerScenarioRecord
 * @typedef {import("../retainer/types").RetainerCalculationInput} RetainerCalculationInput
 * @typedef {import("./types").MembershipBundleDraft} MembershipBundleDraft
 * @typedef {import("./types").BundleTier} BundleTier
 */

/** @type {Record<Exclude<BundleTier, "custom">, string>} */
const TIER_LABELS = {
  essential: "Essential",
  growth: "Growth",
  premium: "Premium",
};

/**
 * @param {number} value
 */
function round2(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Effective included labor hours = Σ estimatedHours * utilization.
 * @param {RetainerCalculationInput} input
 */
function effectiveLaborHours(input) {
  return (input.laborItems ?? []).reduce(
    (sum, item) =>
      sum + (Number(item.estimatedHours) || 0) * (Number(item.utilization) || 0),
    0,
  );
}

/**
 * Map a retainer scenario into three publishable membership bundle drafts
 * (Essential / Growth / Premium). Price and included scope are derived from the
 * server-recomputed tier results — never from precomputed or client values.
 *
 * @param {RetainerScenarioRecord} scenario
 * @returns {MembershipBundleDraft[]}
 */
export function buildBundlesFromScenario(scenario) {
  const tiers = generateScenarioTiers(scenario.input);
  return tiers.map((tier, index) => ({
    name: `${scenario.title} - ${TIER_LABELS[tier.key]}`,
    tier: tier.key,
    description: scenario.description ?? "",
    currency: tier.result.currency,
    billingCycle: tier.input.billingCycle,
    price: round2(tier.result.finalMonthlyRetainer),
    includedVisits: tier.input.expectedMonthlyVisits,
    includedLaborHours: round2(effectiveLaborHours(tier.input)),
    slaLevel: tier.input.slaLevel,
    features: [],
    isPublished: false,
    sortOrder: index,
    scenarioId: scenario.id,
  }));
}
