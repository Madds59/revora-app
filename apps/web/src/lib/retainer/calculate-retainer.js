// @ts-check

import { buildRetainerInsights } from "./recommendations.js";

/**
 * @typedef {import("./types").RetainerCalculationInput} RetainerCalculationInput
 * @typedef {import("./types").RetainerCalculationResult} RetainerCalculationResult
 * @typedef {import("./types").RetainerRecommendation} RetainerRecommendation
 * @typedef {import("./types").RetainerWarning} RetainerWarning
 */

const ROUNDING_STRATEGIES = new Set([
  "none",
  "nearest_10",
  "nearest_50",
  "nearest_100",
  "psychological",
]);

/**
 * @param {unknown} value
 * @param {RetainerWarning[]} warnings
 * @param {string} code
 */
function sanitizeNumber(value, warnings, code) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  warnings.push({ code, severity: "warning" });
  return 0;
}

/**
 * @param {number} value
 * @param {10 | 50 | 100} step
 */
function roundToNearest(value, step) {
  return Math.round(value / step) * step;
}

/**
 * @param {number} value
 * @param {"none" | "nearest_10" | "nearest_50" | "nearest_100" | "psychological"} strategy
 */
function applyRounding(value, strategy) {
  switch (strategy) {
    case "nearest_10":
      return roundToNearest(value, 10);
    case "nearest_50":
      return roundToNearest(value, 50);
    case "nearest_100":
      return roundToNearest(value, 100);
    case "psychological": {
      const base = Math.max(0, Math.floor(value / 100) * 100 + 99);
      return base;
    }
    case "none":
    default:
      return value;
  }
}

/**
 * Calculate a monthly retainer using the business rules from the handoff.
 * @param {RetainerCalculationInput} input
 * @returns {RetainerCalculationResult}
 */
export function calculateRetainer(input) {
  /** @type {RetainerWarning[]} */
  const warnings = [];
  /** @type {(value: unknown, code: string) => number} */
  const safe = (value, code) => sanitizeNumber(value, warnings, code);

  const currency = input.currency ?? "AED";
  const billingCycle = input.billingCycle ?? "monthly";
  const contractLengthMonths = Math.max(1, Math.floor(safe(input.contractLengthMonths, "invalid_contract_length")));
  const numberOfVehicles = Math.max(1, Math.floor(safe(input.numberOfVehicles, "invalid_vehicle_count")));
  const expectedMonthlyVisits = Math.max(0, safe(input.expectedMonthlyVisits, "invalid_visit_count"));
  const slaLevel = input.slaLevel ?? "standard";
  const pricing = {
    targetMargin: safe(input.pricing?.targetMargin, "invalid_target_margin"),
    minimumMargin: safe(input.pricing?.minimumMargin, "invalid_minimum_margin"),
    desiredNetProfit: input.pricing?.desiredNetProfit == null ? undefined : safe(input.pricing.desiredNetProfit, "invalid_desired_profit"),
    discount: safe(input.pricing?.discount, "invalid_discount"),
    vat: safe(input.pricing?.vat ?? 0.05, "invalid_vat"),
    rounding: ROUNDING_STRATEGIES.has(input.pricing?.rounding) ? input.pricing.rounding : "none",
    annualPrepayDiscount:
      input.pricing?.annualPrepayDiscount == null
        ? undefined
        : safe(input.pricing.annualPrepayDiscount, "invalid_annual_prepay_discount"),
  };

  const laborItems = Array.isArray(input.laborItems) ? input.laborItems : [];
  const partsItems = Array.isArray(input.partsItems) ? input.partsItems : [];
  const toolItems = Array.isArray(input.toolItems) ? input.toolItems : [];
  const overhead = input.overhead ?? {};
  const risk = input.risk ?? {};

  if (pricing.targetMargin >= 1) {
    const zero = {
      ok: false,
      error: "margin_out_of_range",
      currency,
      laborCost: 0,
      internalPartsCost: 0,
      billablePartsRevenue: 0,
      allocatedToolCost: 0,
      overheadCost: 0,
      riskBufferAmount: 0,
      baseMonthlyCost: 0,
      preTaxRetainer: 0,
      discountAmount: 0,
      subtotalAfterDiscount: 0,
      vatAmount: 0,
      finalMonthlyRetainerRaw: 0,
      finalMonthlyRetainer: 0,
      grossProfit: 0,
      grossMargin: 0,
      breakEvenPrice: 0,
      annualContractValue: 0,
      totalContractValue: 0,
      pricePerVehicle: 0,
      pricePerVisit: 0,
      warnings: /** @type {RetainerWarning[]} */ ([
        ...warnings,
        { code: "margin_out_of_range", severity: "critical" },
      ]),
      recommendations: [],
    };
    return zero;
  }

  const laborCost = laborItems.reduce((sum, item, index) => {
    const hourlyCost = safe(item?.hourlyCost, `invalid_labor_hourly_${index}`);
    const estimatedHours = safe(item?.estimatedHours, `invalid_labor_hours_${index}`);
    const utilization = safe(item?.utilization, `invalid_labor_utilization_${index}`);
    return sum + hourlyCost * estimatedHours * utilization;
  }, 0);

  const internalPartsCost = partsItems.reduce((sum, item, index) => {
    const unitCost = safe(item?.unitCost, `invalid_parts_unit_${index}`);
    const quantity = safe(item?.quantity, `invalid_parts_qty_${index}`);
    return sum + unitCost * quantity;
  }, 0);

  const billablePartsRevenue = partsItems.reduce((sum, item, index) => {
    const unitCost = safe(item?.unitCost, `invalid_parts_billable_unit_${index}`);
    const quantity = safe(item?.quantity, `invalid_parts_billable_qty_${index}`);
    const markup = safe(item?.markup, `invalid_parts_markup_${index}`);
    return sum + unitCost * quantity * (1 + markup);
  }, 0);

  const allocatedToolCost = toolItems.reduce((sum, item, index) => {
    const monthlyCost = safe(item?.monthlyCost, `invalid_tool_cost_${index}`);
    const allocation = safe(item?.allocation, `invalid_tool_allocation_${index}`);
    return sum + monthlyCost * allocation;
  }, 0);

  const overheadCost =
    safe(overhead.rent, "invalid_overhead_rent") +
    safe(overhead.utilities, "invalid_overhead_utilities") +
    safe(overhead.equipmentDepreciation, "invalid_overhead_equipment") +
    safe(overhead.insurance, "invalid_overhead_insurance") +
    safe(overhead.adminOverhead, "invalid_overhead_admin") +
    safe(overhead.miscellaneous, "invalid_overhead_misc");

  const combinedRisk =
    safe(risk.reworkBuffer, "invalid_risk_rework") +
    safe(risk.emergencySupportBuffer, "invalid_risk_emergency") +
    safe(risk.prioritySlaPremium, "invalid_risk_priority") +
    safe(risk.warrantyReserve, "invalid_risk_warranty") +
    safe(risk.latePaymentRisk, "invalid_risk_late_payment");

  const costBase = laborCost + internalPartsCost + allocatedToolCost + overheadCost;
  const riskBufferAmount = costBase * combinedRisk;
  const baseMonthlyCost = costBase + riskBufferAmount;
  const preTaxRetainer = baseMonthlyCost / (1 - pricing.targetMargin);
  const discountAmount = preTaxRetainer * pricing.discount;
  const subtotalAfterDiscount = preTaxRetainer - discountAmount;
  const vatAmount = subtotalAfterDiscount * pricing.vat;
  const finalMonthlyRetainerRaw = subtotalAfterDiscount + vatAmount;
  const finalMonthlyRetainer = applyRounding(finalMonthlyRetainerRaw, pricing.rounding);
  const grossProfit = subtotalAfterDiscount - baseMonthlyCost;
  const grossMargin = subtotalAfterDiscount > 0 ? grossProfit / subtotalAfterDiscount : 0;
  const breakEvenPrice = baseMonthlyCost;
  const annualContractValue =
    finalMonthlyRetainer * 12 * (1 - (pricing.annualPrepayDiscount ?? 0));
  const totalContractValue = finalMonthlyRetainer * contractLengthMonths;
  const pricePerVehicle = numberOfVehicles > 0 ? finalMonthlyRetainer / numberOfVehicles : 0;
  const pricePerVisit = expectedMonthlyVisits > 0 ? finalMonthlyRetainer / expectedMonthlyVisits : 0;

  /** @type {RetainerCalculationResult} */
  const result = {
    ok: true,
    currency,
    laborCost,
    internalPartsCost,
    billablePartsRevenue,
    allocatedToolCost,
    overheadCost,
    riskBufferAmount,
    baseMonthlyCost,
    preTaxRetainer,
    discountAmount,
    subtotalAfterDiscount,
    vatAmount,
    finalMonthlyRetainerRaw,
    finalMonthlyRetainer,
    grossProfit,
    grossMargin,
    breakEvenPrice,
    annualContractValue,
    totalContractValue,
    pricePerVehicle,
    pricePerVisit,
    warnings: /** @type {RetainerWarning[]} */ ([]),
    recommendations: /** @type {RetainerRecommendation[]} */ ([]),
  };

  const insights = buildRetainerInsights(
    {
      currency,
      billingCycle,
      contractLengthMonths,
      numberOfVehicles,
      expectedMonthlyVisits,
      slaLevel,
      laborItems,
      partsItems,
      toolItems,
      overhead: {
        rent: safe(overhead.rent, "invalid_overhead_rent"),
        utilities: safe(overhead.utilities, "invalid_overhead_utilities"),
        equipmentDepreciation: safe(overhead.equipmentDepreciation, "invalid_overhead_equipment"),
        insurance: safe(overhead.insurance, "invalid_overhead_insurance"),
        adminOverhead: safe(overhead.adminOverhead, "invalid_overhead_admin"),
        miscellaneous: safe(overhead.miscellaneous, "invalid_overhead_misc"),
      },
      risk: {
        reworkBuffer: safe(risk.reworkBuffer, "invalid_risk_rework"),
        emergencySupportBuffer: safe(risk.emergencySupportBuffer, "invalid_risk_emergency"),
        prioritySlaPremium: safe(risk.prioritySlaPremium, "invalid_risk_priority"),
        warrantyReserve: safe(risk.warrantyReserve, "invalid_risk_warranty"),
        latePaymentRisk: safe(risk.latePaymentRisk, "invalid_risk_late_payment"),
      },
      pricing,
    },
    result,
  );

  result.warnings = [...warnings, ...insights.warnings];
  result.recommendations = insights.recommendations;

  return result;
}
