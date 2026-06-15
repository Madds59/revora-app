// @ts-check

import { calculateRetainer } from "./calculate-retainer.js";

/**
 * @typedef {import("./types").RetainerCalculationInput} RetainerCalculationInput
 * @typedef {import("./types").RetainerCalculationResult} RetainerCalculationResult
 */

/**
 * @typedef {"essential" | "growth" | "premium"} RetainerTierKey
 */

/**
 * @typedef {Object} RetainerTier
 * @property {RetainerTierKey} key
 * @property {RetainerCalculationInput} input
 * @property {RetainerCalculationResult} result
 * @property {"positive" | "neutral" | "warning"} tone
 */

/**
 * Derive Essential / Growth / Premium tier inputs from one base scenario input.
 * Pure and provider-agnostic so the retainer calculator UI and the membership
 * bundles module reuse identical math. Percentages are decimals (e.g. 0.4).
 *
 * @param {RetainerCalculationInput} input
 * @returns {{ key: RetainerTierKey, input: RetainerCalculationInput, tone: "positive" | "neutral" | "warning" }[]}
 */
export function buildScenarioTierInputs(input) {
  const minimumMargin = input.pricing.minimumMargin ?? 0;

  /** @type {RetainerCalculationInput} */
  const essential = {
    ...input,
    pricing: {
      ...input.pricing,
      targetMargin: Math.max(minimumMargin, input.pricing.targetMargin - 0.05),
      discount: Math.min(0.08, input.pricing.discount + 0.02),
    },
  };

  /** @type {RetainerCalculationInput} */
  const premium = {
    ...input,
    slaLevel: "vip",
    pricing: {
      ...input.pricing,
      targetMargin: Math.min(0.9, input.pricing.targetMargin + 0.07),
      discount: Math.max(0, input.pricing.discount - 0.01),
      rounding: "nearest_100",
    },
  };

  return [
    { key: "essential", input: essential, tone: "neutral" },
    { key: "growth", input, tone: "positive" },
    { key: "premium", input: premium, tone: "warning" },
  ];
}

/**
 * Compute the three tiers (Essential / Growth / Premium) for a base input.
 * Each tier is fully recomputed via calculateRetainer — never trust precomputed
 * totals.
 *
 * @param {RetainerCalculationInput} input
 * @returns {RetainerTier[]}
 */
export function generateScenarioTiers(input) {
  return buildScenarioTierInputs(input).map((tier) => ({
    key: tier.key,
    input: tier.input,
    result: calculateRetainer(tier.input),
    tone: tier.tone,
  }));
}
