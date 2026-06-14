"use client";

import { Link, usePathname } from "@/i18n/navigation";
import {
  LayoutDashboard,
  Building2,
  Users,
  ReceiptText,
  CreditCard,
  BarChart3,
  Bell,
  FileClock,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type NavItem = {
  labelKey:
    | "overview"
    | "tenants"
    | "users"
    | "subscriptions"
    | "billing"
    | "analytics"
    | "notifications"
    | "auditLogs"
    | "settings"
    | "superAdmins";
  href: string;
  icon: LucideIcon;
};

const NAV: NavItem[] = [
  { labelKey: "overview", href: "/admin", icon: LayoutDashboard },
  { labelKey: "tenants", href: "/admin/tenants", icon: Building2 },
  { labelKey: "users", href: "/admin/users", icon: Users },
  { labelKey: "subscriptions", href: "/admin/subscriptions", icon: ReceiptText },
  { labelKey: "billing", href: "/admin/billing", icon: CreditCard },
  { labelKey: "analytics", href: "/admin/analytics", icon: BarChart3 },
  { labelKey: "notifications", href: "/admin/notifications", icon: Bell },
  { labelKey: "auditLogs", href: "/admin/audit-logs", icon: FileClock },
  { labelKey: "settings", href: "/admin/settings", icon: Settings },
  { labelKey: "superAdmins", href: "/admin/admins", icon: ShieldCheck },
];

export function AdminNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav className="flex flex-col gap-1 p-2">
      {NAV.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin" || pathname === "/admin/dashboard"
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span>{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
