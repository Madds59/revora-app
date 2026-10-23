"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function AdminSettingsError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="adminSettings" backHref="/admin" />;
}
