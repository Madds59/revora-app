"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function PortalQuoteDetailError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="portalQuotes" backHref="/portal/quotes" />;
}
