"use client";

import { RouteErrorBoundary, type RouteErrorProps } from "@/components/route-error-boundary";

export default function OnboardingError(props: RouteErrorProps) {
  return <RouteErrorBoundary {...props} section="onboarding" backHref="/onboarding" />;
}
