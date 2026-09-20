"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { BrandState } from "@/components/brand-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { reportError } from "@/lib/observability";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");

  useEffect(() => {
    reportError(error, { section: "locale-root", digest: error.digest });
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
