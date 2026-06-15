// @ts-check

/**
 * @typedef {import("./types").RetainerCalculationInput} RetainerCalculationInput
 * @typedef {import("./types").RetainerCalculationResult} RetainerCalculationResult
 * @typedef {import("./types").RetainerRecommendation} RetainerRecommendation
 * @typedef {import("./types").RetainerWarning} RetainerWarning
 */

/**
 * @param {string} code
 * @param {"positive" | "neutral" | "warning"} tone
 */
function makeRecommendation(code, tone) {
  return { code, tone };
}

/**
 * @param {string} code
 * @param {"info" | "warning" | "critical"} severity
 */
function makeWarning(code, severity) {
  return { code, severity };
}

/**
 * Build the rule-based warning and recommendation set for a retainer scenario.
 * @param {RetainerCalculationInput} input
 * @param {RetainerCalculationResult} result
 * @returns {{ warnings: RetainerWarning[]; recommendations: RetainerRecommendation[] }}
 */
export function buildRetainerInsights(input, result) {
  /** @type {RetainerWarning[]} */
  const warnings = [];
  /** @type {RetainerRecommendation[]} */
  const recommendations = [];

  if (!result.ok) {
    warnings.push(makeWarning(result.error ?? "calc_error", "critical"));
    return { warnings, recommendations };
  }

  if (result.grossMargin < input.pricing.minimumMargin) {
    warnings.push(makeWarning("below_min_margin", "critical"));
    recommendations.push(makeRecommendation("raise_margin", "warning"));
  }

  if (input.pricing.discount > 0.2) {
    warnings.push(makeWarning("discount_too_deep", "warning"));
    recommendations.push(makeRecommendation("reduce_discount", "warning"));
  }

  if (result.baseMonthlyCost > 0 && result.laborCost / result.baseMonthlyCost > 0.6) {
    warnings.push(makeWarning("labor_heavy", "warning"));
    recommendations.push(makeRecommendation("improve_labor_efficiency", "neutral"));
  }

  if (result.baseMonthlyCost > 0 && result.overheadCost / result.baseMonthlyCost > 0.25) {
    warnings.push(makeWarning("overhead_high", "warning"));
    recommendations.push(makeRecommendation("trim_overhead", "neutral"));
  }

  if (input.slaLevel === "vip" && result.grossMargin < Math.max(input.pricing.minimumMargin + 0.1, 0.25)) {
    warnings.push(makeWarning("vip_underpriced", "warning"));
    recommendations.push(makeRecommendation("uplift_vip_pricing", "warning"));
  }

  if (input.numberOfVehicles >= 10) {
    warnings.push(makeWarning("fleet_tier", "info"));
    recommendations.push(makeRecommendation("use_fleet_pricing", "positive"));
  }

  if (input.contractLengthMonths >= 12) {
    warnings.push(makeWarning("prepaid_strategy", "info"));
    recommendations.push(makeRecommendation("consider_prepay_discount", "positive"));
  }

  if (
    typeof input.pricing.desiredNetProfit === "number" &&
    Number.isFinite(input.pricing.desiredNetProfit) &&
    result.grossProfit < input.pricing.desiredNetProfit
  ) {
    warnings.push(makeWarning("undercharging", "critical"));
    recommendations.push(makeRecommendation("increase_price_floor", "warning"));
  }

  if (result.grossMargin >= input.pricing.minimumMargin) {
    recommendations.push(makeRecommendation("viable", "positive"));
  }

  return { warnings, recommendations };
}
