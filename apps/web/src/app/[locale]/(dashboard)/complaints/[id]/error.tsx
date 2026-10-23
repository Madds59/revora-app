"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function ComplaintDetailError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="complaints" backHref="/complaints" />;
}
