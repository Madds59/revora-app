"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function MembershipBundlesError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="tools" backHref="/" />;
}
