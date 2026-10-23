"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function PortalAppointmentDetailError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="portalAppointments" backHref="/portal/appointments" />;
}
