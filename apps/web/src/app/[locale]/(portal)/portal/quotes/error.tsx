"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function PortalQuotesError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="portalQuotes" backHref="/portal" />;
}
