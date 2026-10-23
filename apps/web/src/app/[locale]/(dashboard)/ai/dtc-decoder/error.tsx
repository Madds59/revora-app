"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function AiDtcError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="ai" backHref="/ai" />;
}
