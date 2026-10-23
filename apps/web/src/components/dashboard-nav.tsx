"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Bell,
  Calculator,
  CalendarClock,
  CarFront,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileText,
  Files,
  Gauge,
  Home,
  Layers,
  MessageSquare,
  MessageSquareWarning,
  Receipt,
  ScanSearch,
  Settings,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { resolveFeatures } from "@/lib/features/flags";
import { DASHBOARD_NAV, isNavItemActive, visibleGroups } from "@/lib/nav/model";
import type { NavPermissions } from "@/lib/nav/types";

const ICONS: Record<string, LucideIcon> = {
  BarChart3,
  Bell,
  Calculator,
  CalendarClock,
  CarFront,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileText,
  Files,
  Gauge,
  Home,
  Layers,
  MessageSquare,
  MessageSquareWarning,
  Receipt,
  ScanSearch,
  Settings,
  Users,
  Wrench,
};

export function DashboardNav({ permissions }: { permissions: NavPermissions }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const features = resolveFeatures(process.env.NEXT_PUBLIC_REVORA_FEATURES);
  const groups = visibleGroups(DASHBOARD_NAV, { features, permissions });

  return (
    <nav className="flex flex-col gap-4 px-2">
      {groups.map((group, index) => {
        const headingId = group.labelKey ? `nav-group-${group.labelKey}` : undefined;
        return (
          <div
            key={group.labelKey ?? `lead-${index}`}
            className="flex flex-col gap-0.5"
            role={group.labelKey ? "group" : undefined}
            aria-labelledby={headingId}
          >
            {group.labelKey && (
              <p
                id={headingId}
                className="text-sidebar-foreground/50 px-3 pt-1 pb-1 text-[0.6875rem] font-semibold tracking-wider uppercase"
              >
                {t(`group.${group.labelKey}` as Parameters<typeof t>[0])}
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
                <span>{t(item.labelKey as Parameters<typeof t>[0])}</span>
              </Link>
            );
          })}
          </div>
        );
      })}
    </nav>
  );
}
