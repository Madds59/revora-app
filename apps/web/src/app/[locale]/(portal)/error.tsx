"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function PortalError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="portal" backHref="/portal" />;
}
