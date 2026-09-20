"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function CustomerNewError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="customers" backHref="/customers" />;
}
