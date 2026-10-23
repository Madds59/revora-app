"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function VehicleNewError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="vehicleNew" backHref="/vehicles" />;
}
