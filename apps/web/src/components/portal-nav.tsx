"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  CalendarClock,
  CarFront,
  ClipboardCheck,
  FileText,
  Files,
  Home,
  Layers,
  MessageSquare,
  Receipt,
  Settings,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { resolveFeatures } from "@/lib/features/flags";
import { PORTAL_NAV, isNavItemActive, visibleGroups } from "@/lib/nav/model";

const ICONS: Record<string, LucideIcon> = {
  CalendarClock,
  CarFront,
  ClipboardCheck,
  FileText,
  Files,
  Home,
  Layers,
  MessageSquare,
  Receipt,
  Settings,
  Wrench,
};

export function PortalNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const features = resolveFeatures(process.env.NEXT_PUBLIC_REVORA_FEATURES);
  // The portal has no role axis; pricingTools is irrelevant here but the
  // filter signature is shared, so pass it explicitly rather than defaulting.
  const groups = visibleGroups(PORTAL_NAV, {
    features,
    permissions: { pricingTools: true },
  });

  return (
    <nav className="flex flex-col gap-4 px-2">
      {groups.map((group, index) => (
        <div key={group.labelKey ?? `lead-${index}`} className="flex flex-col gap-0.5">
          {group.labelKey && (
            <p className="text-sidebar-foreground/50 px-3 pt-1 pb-1 text-[0.6875rem] font-semibold tracking-wider uppercase">
              {t(`group.${group.labelKey}` as any)}
            </p>
          )}
          {group.items.map((item) => {
            const active = isNavItemActive(pathname, item);
            const Icon = ICONS[item.icon];
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="bg-sidebar-primary absolute inset-y-1.5 start-0 w-0.5 rounded-full"
                  />
                )}
                {Icon && (
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      active ? "text-sidebar-primary" : "text-sidebar-foreground/60",
                    )}
                  />
                )}
                <span>{t(item.labelKey as any)}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
