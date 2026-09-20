"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function InspectionDetailError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="inspections" backHref="/inspections" />;
}
