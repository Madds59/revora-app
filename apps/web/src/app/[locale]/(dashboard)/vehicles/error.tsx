"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function VehiclesError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="vehicles" backHref="/" />;
}
