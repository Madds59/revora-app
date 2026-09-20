"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function MaintenanceError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="maintenance" backHref="/" />;
}
