"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function FeedbackError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="feedback" backHref="/" />;
}
