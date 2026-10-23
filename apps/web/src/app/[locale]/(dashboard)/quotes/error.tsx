"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function QuotesAliasError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="quotations" backHref="/" />;
}
