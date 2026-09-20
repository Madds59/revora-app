"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function AdminAdminsError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="adminAdmins" backHref="/admin" />;
}
