"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function VehicleDetailError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="vehicleDetail" backHref="/vehicles" />;
}
