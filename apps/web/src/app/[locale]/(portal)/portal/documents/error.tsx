"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function PortalDocumentsError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="portalDocuments" backHref="/portal" />;
}
