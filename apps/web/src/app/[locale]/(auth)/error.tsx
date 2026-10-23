"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function AuthError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="auth" backHref="/login" />;
}
