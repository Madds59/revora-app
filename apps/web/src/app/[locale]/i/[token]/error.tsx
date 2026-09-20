"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function ShareError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="share" />;
}
