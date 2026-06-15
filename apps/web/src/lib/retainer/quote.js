// @ts-check

/**
 * @typedef {import("./types").RetainerScenarioRecord} RetainerScenarioRecord
 */

/**
 * @param {number} value
 */
function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * @param {RetainerScenarioRecord} scenario
 */
function buildScenarioNarrative(scenario) {
  const parts = [
    scenario.title,
    scenario.description?.trim(),
    `${scenario.input.contractLengthMonths} month contract`,
    `${scenario.input.numberOfVehicles} vehicles`,
    `${scenario.input.expectedMonthlyVisits} expected monthly visits`,
  ].filter(Boolean);

  return parts.join(" · ");
}

/**
 * Build a quote line that converts the retainer scenario into a quotation item.
 * The contract length becomes the quantity and the monthly retainer becomes the
 * unit price so the quotation total reflects the full contract value.
 *
 * @param {RetainerScenarioRecord} scenario
 * @param {string} businessId
 * @param {string} quotationId
 */
export function buildRetainerQuoteLine(scenario, businessId, quotationId) {
  const monthlyRetainer = scenario.calculatedResults.finalMonthlyRetainer ?? 0;
  const quantity = scenario.input.contractLengthMonths;
  const unitPrice = monthlyRetainer;
  const discountAmount = 0;
  const taxRate = (scenario.input.pricing?.vat ?? 0.05) * 100;
  const gross = quantity * unitPrice;
  const net = gross - discountAmount;
  const tax = net * (taxRate / 100);

  return {
    business_id: businessId,
    quotation_id: quotationId,
    kind: /** @type {"service"} */ ("service"),
    name: scenario.title,
    description: scenario.description ?? buildScenarioNarrative(scenario),
    quantity,
    unit_price: round2(unitPrice),
    discount_amount: round2(discountAmount),
    tax_rate: round2(taxRate),
    total: round2(net + tax),
    transparency: {
      source: "retainer_calculator",
      scenario_id: scenario.id,
      business_id: businessId,
      contract_length_months: scenario.input.contractLengthMonths,
      number_of_vehicles: scenario.input.numberOfVehicles,
      expected_monthly_visits: scenario.input.expectedMonthlyVisits,
      monthly_retainer: round2(monthlyRetainer),
      gross_contract_value: round2(gross),
      tax_rate: round2(taxRate),
    },
  };
}

/**
 * Build customer-facing and internal notes for the retainer quotation.
 *
 * @param {RetainerScenarioRecord} scenario
 */
export function buildRetainerQuoteNotes(scenario) {
  const serviceCategory = scenario.serviceCategory.replaceAll("_", " ");
  const customerNotes = [
    `Converted from retainer scenario: ${scenario.title}.`,
    `Service focus: ${serviceCategory}.`,
    scenario.description?.trim() ? scenario.description.trim() : null,
  ]
    .filter(Boolean)
    .join(" ");

  const internalNotes = [
    `Scenario: ${scenario.title}`,
    `Customer type: ${scenario.customerType}`,
    `Service category: ${scenario.serviceCategory}`,
    `Contract length: ${scenario.input.contractLengthMonths} months`,
    `Monthly visits: ${scenario.input.expectedMonthlyVisits}`,
  ].join(" · ");

  const warrantyTerms = [
    `Retainer quotation converted from ${scenario.title}.`,
    "Final quotation totals are recalculated server-side before saving.",
  ].join(" ");

  return {
    customer_notes: customerNotes,
    internal_notes: internalNotes,
    warranty_terms: warrantyTerms,
  };
}
