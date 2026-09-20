"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function JobsError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="jobs" backHref="/" />;
}
