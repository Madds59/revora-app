"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function PortalInspectionDetailError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="portalInspections" backHref="/portal/inspections" />;
}
