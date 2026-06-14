"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
] as const;

/** Segmented light / dark / system control backed by next-themes. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("shell.themeOptions");
  const [mounted, setMounted] = useState(false);

  // Theme is only known on the client; avoid a hydration mismatch by deferring
  // the active state until after mount.
  useEffect(() => setMounted(true), []);
  const active = mounted ? theme : undefined;

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      className={cn(
        "bg-muted/70 grid grid-cols-3 gap-1 rounded-lg p-1",
        className,
      )}
    >
      {OPTIONS.map(({ value, icon: Icon }) => {
        const selected = active === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(value)}
            onClick={() => setTheme(value)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            >
            <Icon className="size-3.5" />
            <span>{t(value)}</span>
          </button>
        );
      })}
    </div>
  );
}
