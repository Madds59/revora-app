"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function DashboardError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="dashboard" backHref="/" />;
}
