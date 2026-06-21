const OPEN_INVOICE_STATUSES = new Set(["draft", "open", "uncollectible"]);

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPeriodStart(period) {
  switch (String(period ?? "90d").toLowerCase()) {
    case "7d":
      return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    case "all":
      return new Date("1970-01-01T00:00:00.000Z");
    default:
      return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  }
}

function summarizeBillingInvoices(rows, period = "90d") {
  const invoices = Array.isArray(rows) ? rows : [];
  const periodStart = getPeriodStart(period);
  const periodEnd = new Date(Date.now());

  const latestInvoice = invoices.reduce((latest, invoice) => {
    if (!latest) return invoice ?? null;
    const latestDate = toDate(latest.created_at);
    const invoiceDate = toDate(invoice.created_at);
    if (!invoiceDate) return latest;
    if (!latestDate || invoiceDate > latestDate) return invoice;
    return latest;
  }, null);

  const currency = latestInvoice?.currency ?? "AED";
  const openInvoices = invoices.filter((invoice) => OPEN_INVOICE_STATUSES.has(invoice.status));
  const paidInvoicesInPeriod = invoices.filter((invoice) => {
    if (invoice.status !== "paid") return false;
    const activityDate = toDate(invoice.paid_at) ?? toDate(invoice.created_at);
    return !!activityDate && activityDate >= periodStart && activityDate <= periodEnd;
  });

  const totalPaidRevenue = paidInvoicesInPeriod.reduce(
    (sum, invoice) => sum + Number(invoice.total_amount ?? 0),
    0,
  );
  const openInvoiceAmount = openInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.amount_due ?? 0),
    0,
  );
  const overdueOrDueInvoicesCount = openInvoices.filter((invoice) => {
    if (!invoice.due_date) return false;
    const dueDate = toDate(invoice.due_date);
    return !!dueDate && dueDate <= periodEnd;
  }).length;

  return {
    currency,
    total_paid_revenue: totalPaidRevenue,
    open_invoice_amount: openInvoiceAmount,
    average_invoice_value:
      paidInvoicesInPeriod.length === 0
        ? 0
        : Math.round((totalPaidRevenue / paidInvoicesInPeriod.length) * 100) / 100,
    paid_invoices_count: paidInvoicesInPeriod.length,
    open_invoices_count: openInvoices.length,
    overdue_or_due_invoices_count: overdueOrDueInvoicesCount,
  };
}

function getTrendBucketStart(date, period) {
  const copy = new Date(date);
  copy.setSeconds(0, 0);
  if (String(period ?? "90d").toLowerCase() === "7d") {
    copy.setHours(0, 0, 0, 0);
  } else {
    copy.setDate(1);
    copy.setHours(0, 0, 0, 0);
  }
  return copy;
}

function summarizeBillingRevenueTrend(rows, period = "90d") {
  const invoices = Array.isArray(rows) ? rows : [];
  const periodStart = getPeriodStart(period);
  const periodEnd = new Date(Date.now());
  const latestInvoice = invoices.reduce((latest, invoice) => {
    if (!latest) return invoice ?? null;
    const latestDate = toDate(latest.created_at);
    const invoiceDate = toDate(invoice.created_at);
    if (!invoiceDate) return latest;
    if (!latestDate || invoiceDate > latestDate) return invoice;
    return latest;
  }, null);
  const currency = latestInvoice?.currency ?? "AED";

  const buckets = new Map();
  invoices.forEach((invoice) => {
    if (invoice.status !== "paid") return;
    const activityDate = toDate(invoice.paid_at) ?? toDate(invoice.created_at);
    if (!activityDate || activityDate < periodStart || activityDate > periodEnd) return;

    const bucketStart = getTrendBucketStart(activityDate, period);
    const key = bucketStart.toISOString();
    const current = buckets.get(key) ?? {
      bucket_start: key,
      revenue: 0,
      invoice_count: 0,
      currency,
    };
    current.revenue += Number(invoice.total_amount ?? 0);
    current.invoice_count += 1;
    current.currency = currency;
    buckets.set(key, current);
  });

  return [...buckets.values()].sort(
    (left, right) => new Date(left.bucket_start).getTime() - new Date(right.bucket_start).getTime(),
  );
}

export { summarizeBillingInvoices, summarizeBillingRevenueTrend };
