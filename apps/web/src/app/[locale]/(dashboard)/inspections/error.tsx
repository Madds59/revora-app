"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function InspectionsError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="inspections" backHref="/" />;
}
