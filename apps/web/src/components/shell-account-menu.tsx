"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronDown, CreditCard, LogOut, Settings, ShieldCheck } from "lucide-react";

import { signOut } from "@/app/(auth)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export type ShellMenuLink = {
  href: string;
  label: string;
  icon?: "settings" | "billing" | "admin";
};

type ShellAccountMenuProps = {
  email: string;
  title: string;
  subtitle?: string;
  compact?: boolean;
  links?: ShellMenuLink[];
  footerNote?: string;
};

function getInitials(email: string) {
  const local = email.split("@")[0] ?? "";
  const parts = local
    .split(/[._-]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials || email.slice(0, 2).toUpperCase();
}

function resolveIcon(icon?: ShellMenuLink["icon"]): LucideIcon | null {
  switch (icon) {
    case "settings":
      return Settings;
    case "billing":
      return CreditCard;
    case "admin":
      return ShieldCheck;
    default:
      return null;
  }
}

export function ShellAccountMenu({
  email,
  title,
  subtitle,
  compact = false,
  links = [],
  footerNote,
}: ShellAccountMenuProps) {
  const initials = useMemo(() => getInitials(email), [email]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={compact ? "outline" : "ghost"}
            size={compact ? "icon-sm" : "sm"}
            className={cn(
              "w-full justify-start gap-2",
              compact
                ? "size-8 rounded-full px-0"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground h-auto py-1.5",
            )}
            aria-label="Open account menu"
          />
        }
      >
        {compact ? (
          <Avatar className="size-7">
            <AvatarFallback className="text-[11px]">{initials}</AvatarFallback>
          </Avatar>
        ) : (
          <>
            <Avatar className="size-7">
              <AvatarFallback className="text-[11px]">{initials}</AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-1 flex-col items-start text-left leading-tight">
              <span className="truncate text-sm font-medium">{email}</span>
              <span className="text-sidebar-foreground/55 truncate text-xs">
                {title}
              </span>
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-60" />
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex items-start gap-3 py-1">
            <Avatar className="size-8">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 gap-0.5">
              <span className="truncate text-sm font-medium">{email}</span>
              <span className="text-muted-foreground truncate text-xs">
                {title}
              </span>
              {subtitle && (
                <span className="text-muted-foreground truncate text-xs">
                  {subtitle}
                </span>
              )}
            </div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        {links.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {links.map((item) => {
              const Icon = resolveIcon(item.icon);
              return (
                <DropdownMenuItem
                  key={item.href}
                  render={
                    <Link
                      href={item.href}
                      className="flex w-full items-center gap-2"
                    >
                      {Icon ? <Icon className="size-4" /> : null}
                      <span>{item.label}</span>
                    </Link>
                  }
                />
              );
            })}
          </>
        )}

        <DropdownMenuSeparator />
        <div className="px-1.5 py-1">
          <p className="text-muted-foreground mb-1.5 text-xs font-medium">
            Theme
          </p>
          <ThemeToggle />
        </div>

        <DropdownMenuSeparator />
        <form action={signOut} className="w-full">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="size-4" />
            <span>Sign out</span>
          </button>
        </form>
        {footerNote && (
          <div className="px-1.5 pb-1 pt-2 text-xs text-muted-foreground">
            {footerNote}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
