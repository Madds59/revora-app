"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Home,
  FileText,
  MessageSquare,
  Wrench,
  Files,
  Settings,
  CarFront,
  Layers,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = {
  labelKey:
    | "home"
    | "vehicles"
    | "quotes"
    | "jobs"
    | "complaints"
    | "documents"
    | "settings"
    | "memberships"
    | "feedbackSupport";
  href: string;
  icon: LucideIcon;
};

const NAV: NavItem[] = [
  { labelKey: "home", href: "/portal", icon: Home },
  { labelKey: "vehicles", href: "/portal/vehicles", icon: CarFront },
  { labelKey: "memberships", href: "/portal/memberships", icon: Layers },
  { labelKey: "quotes", href: "/portal/quotes", icon: FileText },
  { labelKey: "jobs", href: "/portal/jobs", icon: Wrench },
  { labelKey: "complaints", href: "/portal/complaints", icon: MessageSquare },
  { labelKey: "documents", href: "/portal/documents", icon: Files },
  { labelKey: "feedbackSupport", href: "/portal/feedback", icon: MessageSquare },
  { labelKey: "settings", href: "/portal/settings", icon: Settings },
];

export function PortalNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {NAV.map((item) => {
        const active =
          item.href === "/portal" ? pathname === "/portal" : pathname.startsWith(item.href);
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
