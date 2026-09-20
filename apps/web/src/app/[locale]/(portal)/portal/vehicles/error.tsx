"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function PortalVehiclesError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="portalVehicles" backHref="/portal" />;
}
