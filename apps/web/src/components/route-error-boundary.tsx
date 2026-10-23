"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { ErrorState } from "@/components/error-state";
import { reportError } from "@/lib/observability";

export type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Shared body for every route-segment error.tsx. Copy is looked up under
 * `errorPages.<section>` and falls back to `errorPages.generic` so a missing
 * key can never crash the boundary that is supposed to be the safety net.
 */
export function RouteErrorBoundary({
  error,
  reset,
  section,
  backHref,
  padded = true,
}: RouteErrorProps & { section: string; backHref?: string; padded?: boolean }) {
  const t = useTranslations("errorPages");
  const has = (k: string) =>
    t.has(k as Parameters<typeof t.has>[0]);

  useEffect(() => {
    reportError(error, { section, digest: error.digest });
  }, [error, section]);

  const key = has(`${section}.title`) ? section : "generic";
  const body = (
    <ErrorState
      title={t(`${key}.title` as Parameters<typeof t>[0])}
      description={t(`${key}.description` as Parameters<typeof t>[0])}
      errorDigest={error.digest}
      onRetry={reset}
      backHref={backHref}
      backLabel={backHref ? t(`${key}.backLabel` as Parameters<typeof t>[0]) : undefined}
    />
  );
  return padded ? <div className="p-6">{body}</div> : body;
}
