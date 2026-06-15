"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { switchLocalePath } from "@/lib/locale-path.js";

const OPTIONS = [
  { locale: "en", label: "EN" },
  { locale: "ar", label: "AR" },
] as const;

export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("shell.languageOptions");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  const links = useMemo(
    () =>
      OPTIONS.map((option) => {
        const base = switchLocalePath(pathname, option.locale);
        return {
          ...option,
          href: query ? `${base}?${query}` : base,
          active: locale === option.locale,
        };
      }),
    [locale, pathname, query],
  );

  return (
    <div
      aria-label={t("label")}
      className={cn(
        "bg-muted/70 grid grid-cols-[auto_1fr_1fr] items-center gap-1 rounded-lg p-1",
        className,
      )}
    >
      <span className="text-muted-foreground flex items-center gap-1.5 px-2 text-xs font-medium">
        <Languages className="size-3.5" />
        <span>{t("label")}</span>
      </span>
      {links.map((item) => (
        <Link
          key={item.locale}
          href={item.href}
          className={cn(
            "flex items-center justify-center rounded-md px-2 py-1 text-xs font-medium transition-colors",
            item.active
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-current={item.active ? "true" : undefined}
          aria-label={item.locale === "en" ? t("switchToEnglish") : t("switchToArabic")}
        >
          {item.locale === "en" ? t("en") : t("ar")}
        </Link>
      ))}
    </div>
  );
}
