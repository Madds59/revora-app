"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Calculator,
  Layers,
  Home,
  Users,
  FileText,
  Wrench,
  MessageSquareWarning,
  MessageSquare,
  Files,
  Settings,
  CreditCard,
  BarChart3,
  Bell,
  CarFront,
  ScanSearch,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = {
  labelKey:
    | "dashboard"
    | "customers"
    | "vehicles"
    | "jobs"
    | "quotes"
    | "complaints"
    | "documents"
    | "billing"
    | "analytics"
    | "notifications"
    | "settings"
    | "feedback"
    | "implementation"
    | "retainerCalculator"
    | "membershipBundles"
    | "vehicleIntelligence";
  href: string;
  icon: LucideIcon;
  aliases?: string[];
};

const NAV: NavItem[] = [
  { labelKey: "dashboard", href: "/dashboard", icon: Home, aliases: ["/"] },
  { labelKey: "customers", href: "/customers", icon: Users },
  { labelKey: "vehicles", href: "/vehicles", icon: CarFront },
  { labelKey: "jobs", href: "/jobs", icon: Wrench },
  { labelKey: "quotes", href: "/quotes", icon: FileText, aliases: ["/quotations"] },
  { labelKey: "complaints", href: "/complaints", icon: MessageSquareWarning },
  { labelKey: "documents", href: "/documents", icon: Files },
  { labelKey: "billing", href: "/billing", icon: CreditCard },
  { labelKey: "analytics", href: "/analytics", icon: BarChart3 },
  { labelKey: "notifications", href: "/notifications", icon: Bell },
  { labelKey: "settings", href: "/settings", icon: Settings, aliases: ["/settings/business"] },
  { labelKey: "feedback", href: "/feedback", icon: MessageSquare },
  { labelKey: "implementation", href: "/implementation", icon: ClipboardList },
  { labelKey: "retainerCalculator", href: "/tools/retainer-calculator", icon: Calculator },
  { labelKey: "membershipBundles", href: "/tools/membership-bundles", icon: Layers },
  { labelKey: "vehicleIntelligence", href: "/ai", icon: ScanSearch, aliases: ["/ai/search", "/ai/vin-decoder", "/ai/dtc-decoder", "/ai/vehicle-diagnosis"] },
];

export function DashboardNav({
  showRetainerCalculator = true,
}: {
  showRetainerCalculator?: boolean;
} = {}) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {NAV.filter(
        (item) =>
          (item.labelKey !== "retainerCalculator" && item.labelKey !== "membershipBundles") ||
          showRetainerCalculator,
      ).map((item) => {
        const active = isActive(pathname, item.href, item.aliases);
        const Icon = item.icon;
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
            <Icon
              className={cn(
                "size-4 shrink-0",
                active ? "text-sidebar-primary" : "text-sidebar-foreground/60",
              )}
            />
            <span>{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function isActive(pathname: string, href: string, aliases?: string[]) {
  const candidates = [href, ...(aliases ?? [])];
  return candidates.some((candidate) => {
    if (candidate === "/") return pathname === "/";
    if (pathname === candidate) return true;
    return pathname.startsWith(`${candidate}/`);
  });
}
