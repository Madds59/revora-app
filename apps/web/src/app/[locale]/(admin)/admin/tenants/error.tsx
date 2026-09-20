"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function AdminTenantsError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="adminTenants" backHref="/admin" />;
}
