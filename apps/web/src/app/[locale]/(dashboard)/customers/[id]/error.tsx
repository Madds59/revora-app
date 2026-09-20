"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function CustomerDetailError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="customers" backHref="/customers" />;
}
