"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function AppointmentDetailError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="appointments" backHref="/appointments" />;
}
