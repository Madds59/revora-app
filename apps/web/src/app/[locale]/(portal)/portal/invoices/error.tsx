"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function PortalInvoicesError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="portalInvoices" backHref="/portal" />;
}
