"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function PortalVehicleDetailError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="portalVehicles" backHref="/portal/vehicles" />;
}
