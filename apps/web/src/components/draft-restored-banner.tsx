"use client";

import { History } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { StatusBanner } from "@/components/status-banner";
import { Button } from "@/components/ui/button";

export function DraftRestoredBanner({
  savedAt,
  onDiscard,
  className,
}: {
  savedAt: Date | null;
  onDiscard: () => void;
  className?: string;
}) {
  const t = useTranslations("common.draft");
  const format = useFormatter();
  return (
    <StatusBanner
      role="status"
      tone="muted"
      icon={History}
      title={t("restoredTitle")}
      className={className}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{savedAt ? t("savedAgo", { when: format.relativeTime(savedAt, new Date()) }) : t("savedRecently")}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
          {t("discard")}
        </Button>
      </div>
    </StatusBanner>
  );
}
