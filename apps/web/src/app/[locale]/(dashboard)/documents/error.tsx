"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function DocumentsError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="documents" backHref="/" />;
}
