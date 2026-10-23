"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function RetainerCalculatorError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="tools" backHref="/" />;
}
