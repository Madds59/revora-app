"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function QuotationNewError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="quotations" backHref="/quotations" />;
}
