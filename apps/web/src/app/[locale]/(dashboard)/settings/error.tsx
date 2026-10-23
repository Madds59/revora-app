"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function SettingsError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="settings" backHref="/" />;
}
