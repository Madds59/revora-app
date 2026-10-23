"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function BillingError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="billing" backHref="/" />;
}
