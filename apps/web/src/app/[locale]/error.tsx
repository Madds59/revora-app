"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { BrandState } from "@/components/brand-state";
import { Button, buttonVariants } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");

  useEffect(() => {
    // Surface for diagnostics; replace with Sentry/PostHog capture later.
    console.error(error);
  }, [error]);

  return (
    <BrandState code={t("code")} title={t("title")} description={t("description")}>
      <Button onClick={reset}>
        <RotateCcw />
        {t("tryAgain")}
      </Button>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        {t("backToDashboard")}
      </Link>
      {error.digest && (
        <p className="text-muted-foreground/70 mt-1 w-full text-xs">
          {t("reference", { id: error.digest })}
        </p>
      )}
    </BrandState>
  );
}
