"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function AdminError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="admin" backHref="/admin" />;
}
