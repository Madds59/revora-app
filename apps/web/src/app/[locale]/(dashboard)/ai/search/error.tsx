"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function AiSearchError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="ai" backHref="/ai" />;
}
