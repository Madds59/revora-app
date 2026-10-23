"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function PortalMembershipsError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="portalMemberships" backHref="/portal" />;
}
