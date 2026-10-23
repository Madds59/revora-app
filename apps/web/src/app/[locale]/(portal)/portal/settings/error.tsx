"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function PortalSettingsError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="portalSettings" backHref="/portal" />;
}
