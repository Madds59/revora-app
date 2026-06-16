import test from "node:test";
import assert from "node:assert/strict";

import { summarizeBillingInvoices } from "../src/lib/billing-summary.js";

const realNow = Date.now;

test("summarizeBillingInvoices aggregates amounts and chooses the latest currency", () => {
  Date.now = () => new Date("2026-06-16T12:00:00.000Z").getTime();

  const summary = summarizeBillingInvoices(
    [
      {
        currency: "AED",
        status: "paid",
        total_amount: 12000,
        amount_due: 0,
        due_date: "2026-06-01T00:00:00.000Z",
        paid_at: "2026-06-02T00:00:00.000Z",
        created_at: "2026-06-01T00:00:00.000Z",
      },
      {
        currency: "SAR",
        status: "open",
        total_amount: 5000,
        amount_due: 5000,
        due_date: "2026-06-10T00:00:00.000Z",
        paid_at: null,
        created_at: "2026-06-10T00:00:00.000Z",
      },
      {
        currency: "USD",
        status: "draft",
        total_amount: 2500,
        amount_due: 2500,
        due_date: "2026-06-20T00:00:00.000Z",
        paid_at: null,
        created_at: "2026-06-15T00:00:00.000Z",
      },
    ],
    "90d",
  );

  assert.equal(summary.currency, "USD");
  assert.equal(summary.total_paid_revenue, 12000);
  assert.equal(summary.open_invoice_amount, 7500);
  assert.equal(summary.average_invoice_value, 12000);
  assert.equal(summary.paid_invoices_count, 1);
  assert.equal(summary.open_invoices_count, 2);
  assert.equal(summary.overdue_or_due_invoices_count, 1);
});

test("summarizeBillingInvoices respects the requested period", () => {
  Date.now = () => new Date("2026-06-16T12:00:00.000Z").getTime();

  const summary = summarizeBillingInvoices(
    [
      {
        currency: "AED",
        status: "paid",
        total_amount: 1000,
        amount_due: 0,
        due_date: "2026-06-02T00:00:00.000Z",
        paid_at: "2026-06-02T00:00:00.000Z",
        created_at: "2026-05-01T00:00:00.000Z",
      },
      {
        currency: "AED",
        status: "paid",
        total_amount: 4000,
        amount_due: 0,
        due_date: "2026-06-10T00:00:00.000Z",
        paid_at: "2026-06-10T00:00:00.000Z",
        created_at: "2026-06-10T00:00:00.000Z",
      },
    ],
    "7d",
  );

  assert.equal(summary.total_paid_revenue, 4000);
  assert.equal(summary.paid_invoices_count, 1);
  assert.equal(summary.currency, "AED");
});

test.after(() => {
  Date.now = realNow;
});
