"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function PortalHealthCheckError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="portalAi" backHref="/portal" />;
}
