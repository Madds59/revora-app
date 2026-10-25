"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function LeadDetailError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="leads" backHref="/leads" />;
}
