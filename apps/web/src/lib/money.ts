import { formatCurrency as formatMoneyCurrency } from "@/lib/formatters";

export function formatCurrency(amount: number, currency = "AED"): string {
  return formatMoneyCurrency(amount, currency);
}

/** Per-line math shared by the quote builder and totals recompute. */
export function computeLine(
  quantity: number,
  unitPrice: number,
  discountAmount: number,
  taxRate: number,
) {
  const gross = quantity * unitPrice;
  const net = gross - discountAmount;
  const tax = net * (taxRate / 100);
  return { gross, net, tax, total: net + tax };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Roll line items up into quotation-level subtotal/discount/tax/total. */
export function computeTotals(
  items: {
    quantity: number;
    unit_price: number;
    discount_amount: number;
    tax_rate: number;
  }[],
) {
  let subtotal = 0;
  let discount_total = 0;
  let tax_total = 0;
  for (const item of items) {
    const { gross, tax } = computeLine(
      item.quantity,
      item.unit_price,
      item.discount_amount,
      item.tax_rate,
    );
    subtotal += gross;
    discount_total += item.discount_amount;
    tax_total += tax;
  }
  const total = subtotal - discount_total + tax_total;
  return {
    subtotal: round2(subtotal),
    discount_total: round2(discount_total),
    tax_total: round2(tax_total),
    total: round2(total),
  };
}
