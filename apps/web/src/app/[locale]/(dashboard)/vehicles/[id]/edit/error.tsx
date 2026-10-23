"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function VehicleEditError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="vehicleEdit" backHref="/vehicles" />;
}
