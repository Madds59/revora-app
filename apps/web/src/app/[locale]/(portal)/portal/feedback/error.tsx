"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function PortalFeedbackError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="portalFeedback" backHref="/portal" />;
}
