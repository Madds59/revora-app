"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function AdminNotificationsError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="adminNotifications" backHref="/admin" />;
}
