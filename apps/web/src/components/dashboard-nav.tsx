"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  FileText,
  Wrench,
  MessageSquareWarning,
  Files,
  Settings,
  CreditCard,
  BarChart3,
  Bell,
  CarFront,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  aliases?: string[];
};

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home, aliases: ["/"] },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Vehicles", href: "/vehicles", icon: CarFront },
  { label: "Jobs", href: "/jobs", icon: Wrench },
  { label: "Quotes", href: "/quotes", icon: FileText, aliases: ["/quotations"] },
  { label: "Complaints", href: "/complaints", icon: MessageSquareWarning },
  { label: "Documents", href: "/documents", icon: Files },
  { label: "Billing", href: "/billing", icon: CreditCard },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Settings", href: "/settings", icon: Settings, aliases: ["/settings/business"] },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {NAV.map((item) => {
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
            <span>{item.label}</span>
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
