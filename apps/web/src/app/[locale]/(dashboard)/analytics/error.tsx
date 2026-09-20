"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function AnalyticsError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="analytics" backHref="/" />;
}
