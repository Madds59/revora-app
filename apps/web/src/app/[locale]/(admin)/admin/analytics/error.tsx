"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function AdminAnalyticsError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="adminAnalytics" backHref="/admin" />;
}
