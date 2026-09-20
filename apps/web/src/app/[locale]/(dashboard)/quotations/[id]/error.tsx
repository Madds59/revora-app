"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function QuotationDetailError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="quotations" backHref="/quotations" />;
}
