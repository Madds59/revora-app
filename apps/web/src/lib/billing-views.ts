import type { Json } from "@/lib/database.types";

export interface PaginatedListResult<T> {
  rows: T[];
  total_count: number;
}

export interface BillingPlanFeatureRow {
  id: string;
  feature_key: string;
  feature_name: string;
  included: boolean;
  limit_value: number | null;
  limit_unit: string | null;
}

export interface BillingPlanCatalogRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  currency: string;
  monthly_amount: number | null;
  yearly_amount: number | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  entitlements: Record<string, unknown> | null;
  features: BillingPlanFeatureRow[];
}

export interface BillingInvoiceSummaryRow {
  id: string;
  stripe_invoice_id: string;
  invoice_number: string | null;
  subscription_plan_key: string | null;
  status: "draft" | "open" | "paid" | "uncollectible" | "void" | "deleted";
  currency: string;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  paid_at: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  created_at: string;
}

export interface BillingPaymentEvent {
  id: string;
  provider_event_id: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  invoice_id: string | null;
  event_type: string;
  status: string;
  amount: number;
  currency: string;
  occurred_at: string;
  raw_payload?: Json;
}

export interface BillingRevenueSummary {
  currency: string;
  total_paid_revenue: number;
  open_invoice_amount: number;
  average_invoice_value: number;
  paid_invoices_count: number;
  open_invoices_count: number;
  overdue_or_due_invoices_count: number;
}
