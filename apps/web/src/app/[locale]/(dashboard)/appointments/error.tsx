"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function AppointmentsError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="appointments" backHref="/" />;
}
