"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function AdminAuditLogsError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="adminAuditLogs" backHref="/admin" />;
}
