"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type FilterOption = { label: string; value: string };

export function FilterToolbar({
  searchValue,
  onSearchValueChange,
  searchPlaceholder,
  statusValue,
  onStatusValueChange,
  statusOptions,
  dateValue,
  onDateValueChange,
  dateOptions,
  action,
  className,
}: {
  action?: React.ReactNode;
  className?: string;
  dateOptions?: FilterOption[];
  dateValue?: string;
  onDateValueChange?: (value: string) => void;
  onSearchValueChange: (value: string) => void;
  onStatusValueChange?: (value: string) => void;
  searchPlaceholder?: string;
  searchValue: string;
  statusOptions?: FilterOption[];
  statusValue?: string;
}) {
  const t = useTranslations("common.filters");
  const resolvedSearchPlaceholder = searchPlaceholder ?? t("searchPlaceholder");
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card/70 p-4 shadow-sm backdrop-blur lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_220px]">
        <div className="grid gap-2">
          <Label className="sr-only" htmlFor="filter-search">
            {t("search")}
          </Label>
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute start-2 top-1/2 -translate-y-1/2" />
            <Input
              id="filter-search"
              value={searchValue}
              onChange={(event) => onSearchValueChange(event.target.value)}
              placeholder={resolvedSearchPlaceholder}
              className="ps-8"
            />
          </div>
        </div>

        {statusOptions && onStatusValueChange && (
          <div className="grid gap-2">
            <Label className="sr-only" htmlFor="filter-status">
              {t("status")}
            </Label>
            <Select
              value={statusValue}
              onValueChange={(value) => onStatusValueChange(value ?? "all")}
            >
              <SelectTrigger id="filter-status" className="w-full">
                <SelectValue placeholder={t("status")}>
                  {(value) =>
                    statusOptions.find((option) => option.value === value)?.label ?? null
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {dateOptions && onDateValueChange && (
          <div className="grid gap-2">
            <Label className="sr-only" htmlFor="filter-date">
              {t("dateRange")}
            </Label>
            <Select
              value={dateValue}
              onValueChange={(value) => onDateValueChange(value ?? "all")}
            >
              <SelectTrigger id="filter-date" className="w-full">
                <SelectValue placeholder={t("dateRange")}>
                  {(value) =>
                    dateOptions.find((option) => option.value === value)?.label ?? null
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {dateOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {action && (
        <div className="flex w-full shrink-0 flex-wrap gap-2 lg:w-auto lg:justify-end">
          {action}
        </div>
      )}
    </div>
  );
}
