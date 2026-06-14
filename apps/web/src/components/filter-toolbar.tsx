"use client";

import { Search } from "lucide-react";

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
  searchPlaceholder = "Search",
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
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_220px]">
        <div className="grid gap-2">
          <Label className="sr-only" htmlFor="filter-search">
            Search
          </Label>
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute start-2 top-1/2 -translate-y-1/2" />
            <Input
              id="filter-search"
              value={searchValue}
              onChange={(event) => onSearchValueChange(event.target.value)}
              placeholder={searchPlaceholder}
              className="ps-8"
            />
          </div>
        </div>

        {statusOptions && onStatusValueChange && (
          <div className="grid gap-2">
            <Label className="sr-only" htmlFor="filter-status">
              Status
            </Label>
            <Select value={statusValue} onValueChange={(value) => onStatusValueChange(value ?? "all")}>
              <SelectTrigger id="filter-status" className="w-full">
                <SelectValue placeholder="Status" />
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
              Date range
            </Label>
            <Select value={dateValue} onValueChange={(value) => onDateValueChange(value ?? "all")}>
              <SelectTrigger id="filter-date" className="w-full">
                <SelectValue placeholder="Date range" />
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

      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}
