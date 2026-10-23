"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function InvoiceDetailError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="invoices" backHref="/invoices" />;
}
