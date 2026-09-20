"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function NotificationsError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="notifications" backHref="/" />;
}
