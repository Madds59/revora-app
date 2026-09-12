"use client";

import { useTranslations } from "next-intl";

import { ErrorState } from "@/components/error-state";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorPages.dashboard");
  return (
    <div className="p-6">
      <ErrorState
        title={t("title")}
        description={t("description")}
        errorDigest={error.digest}
        onRetry={reset}
        backHref="/"
        backLabel={t("backLabel")}
      />
    </div>
  );
}
