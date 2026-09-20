"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function PortalComplaintsError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="portalComplaints" backHref="/portal" />;
}
