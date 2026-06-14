"use client";

import { BadgeCheck, Building2, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

import type { AccountIntent } from "@/lib/account-intent";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{
  value: AccountIntent;
  title: string;
  description: string;
  icon: typeof Building2;
  note?: string;
}> = [
  {
    value: "business_owner",
    title: "I own/manage a service business",
    description:
      "Create a workspace for your workshop, detailing center, tire shop, or service team.",
    icon: Building2,
  },
  {
    value: "customer",
    title: "I am a customer/consumer",
    description:
      "Access quotes, approvals, jobs, complaints, and documents shared by a business.",
    icon: UserRound,
  },
  {
    value: "staff_invited",
    title: "I was invited as staff",
    description:
      "Join a business team using an invitation from an owner or manager.",
    icon: BadgeCheck,
    note: "Invitation required",
  },
];

export function AccountIntentPicker({
  value,
  onChange,
  className,
}: {
  value: AccountIntent | null;
  onChange: (value: AccountIntent) => void;
  className?: string;
}) {
  const t = useTranslations("auth.signup.accountTypes");

  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)}>
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = value === option.value;
        const title =
          option.value === "business_owner"
            ? t("businessOwnerTitle")
            : option.value === "customer"
              ? t("customerTitle")
              : t("staffTitle");
        const description =
          option.value === "business_owner"
            ? t("businessOwnerDescription")
            : option.value === "customer"
              ? t("customerDescription")
              : t("staffDescription");

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "border-input hover:border-primary/60 hover:bg-primary/[0.03] flex h-full min-h-32 flex-col gap-3 rounded-xl border p-4 text-start transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
              selected &&
                "border-primary bg-primary/[0.05] ring-1 ring-primary/25",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-lg",
                  selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                )}
              >
                <Icon className="size-5" />
              </span>
              {option.note && (
                <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                  {t("invitationRequired")}
                </span>
              )}
            </div>
            <div className="grid gap-1">
              <p className="text-sm font-semibold leading-tight">{title}</p>
              <p className="text-muted-foreground text-xs leading-5">
                {description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
