"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function PortalJobsError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="portalJobs" backHref="/portal" />;
}
