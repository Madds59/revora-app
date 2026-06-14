"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CarFront, Filter, SearchX } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { FilterToolbar } from "@/components/filter-toolbar";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { matchesQuery } from "@/lib/filtering";
import { formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { Vehicle } from "@/lib/database.types";

export type VehicleListRow = Pick<
  Vehicle,
  | "id"
  | "customer_id"
  | "make"
  | "model"
  | "year"
  | "plate_number"
  | "vin"
  | "color"
  | "created_at"
  | "updated_at"
> & {
  customer: {
    id: string;
    full_name: string;
    email: string | null;
  } | null;
  last_service_at: string | null;
};

type FilterValue = "all" | string;

function vehicleLabel(vehicle: VehicleListRow) {
  return (
    [vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
    vehicle.plate_number ||
    vehicle.vin ||
    "Vehicle"
  );
}

function FilterSection({
  makeValue,
  customerValue,
  makeOptions,
  customerOptions,
  onMakeValueChange,
  onCustomerValueChange,
  onReset,
}: {
  customerOptions: Array<{ label: string; value: string }>;
  customerValue: FilterValue;
  makeOptions: Array<{ label: string; value: string }>;
  makeValue: FilterValue;
  onCustomerValueChange: (value: FilterValue) => void;
  onMakeValueChange: (value: FilterValue) => void;
  onReset: () => void;
}) {
  const t = useTranslations("dashboardVehicles");

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-end md:justify-between">
      <div className="grid flex-1 gap-3 md:grid-cols-2">
        <div className="grid gap-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("filters.make")}
          </div>
          <Select value={makeValue} onValueChange={(value) => onMakeValueChange(value ?? "all")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("filters.allMakes")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.allMakes")}</SelectItem>
              {makeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("filters.customer")}
          </div>
          <Select
            value={customerValue}
            onValueChange={(value) => onCustomerValueChange(value ?? "all")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("filters.allCustomers")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.allCustomers")}</SelectItem>
              {customerOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <button
        type="button"
        onClick={onReset}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit")}
      >
        <SearchX />
        {t("filters.reset")}
      </button>
    </div>
  );
}

export function VehiclesBrowser({
  vehicles,
  canCreate,
}: {
  canCreate: boolean;
  vehicles: VehicleListRow[];
}) {
  const t = useTranslations("dashboardVehicles");
  const [search, setSearch] = useState("");
  const [makeValue, setMakeValue] = useState<FilterValue>("all");
  const [customerValue, setCustomerValue] = useState<FilterValue>("all");

  const makeOptions = useMemo(
    () =>
      Array.from(
        new Map(
          vehicles
            .map((vehicle) => vehicle.make?.trim())
            .filter((value): value is string => !!value)
            .map((value) => [value.toLowerCase(), value]),
        ).entries(),
      ).map(([key, value]) => ({ label: value, value: key })),
    [vehicles],
  );

  const customerOptions = useMemo(
    () =>
      Array.from(
        new Map(
          vehicles
            .filter((vehicle) => vehicle.customer)
            .map((vehicle) => [vehicle.customer!.id, vehicle.customer!.full_name]),
        ).entries(),
      ).map(([value, label]) => ({ label, value })),
    [vehicles],
  );

  const filtered = useMemo(() => {
    const makeFilter = makeValue === "all" ? null : makeValue;
    const customerFilter = customerValue === "all" ? null : customerValue;
    return vehicles.filter((vehicle) => {
      const matchesSearch =
        search.trim().length === 0 ||
        matchesQuery(
          [
            vehicle.make,
            vehicle.model,
            vehicle.plate_number,
            vehicle.vin,
            vehicle.customer?.full_name,
            vehicle.customer?.email,
          ],
          search,
        );
      const matchesMake =
        !makeFilter || vehicle.make?.trim().toLowerCase() === makeFilter;
      const matchesCustomer =
        !customerFilter || vehicle.customer?.id === customerFilter;
      return matchesSearch && matchesMake && matchesCustomer;
    });
  }, [customerValue, makeValue, search, vehicles]);

  const hasFilters = search.trim().length > 0 || makeValue !== "all" || customerValue !== "all";

  return (
    <div className="flex flex-col gap-6">
      <FilterToolbar
        searchPlaceholder={t("searchPlaceholder")}
        searchValue={search}
        onSearchValueChange={setSearch}
        action={
          canCreate ? (
            <Link href="/vehicles/new" className={buttonVariants()}>
              {t("actions.addVehicle")}
            </Link>
          ) : undefined
        }
      />

      <FilterSection
        makeValue={makeValue}
        customerValue={customerValue}
        makeOptions={makeOptions}
        customerOptions={customerOptions}
        onMakeValueChange={setMakeValue}
        onCustomerValueChange={setCustomerValue}
        onReset={() => {
          setSearch("");
          setMakeValue("all");
          setCustomerValue("all");
        }}
      />

      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{t("summary.visible", { count: filtered.length, total: vehicles.length })}</span>
        {hasFilters && <Badge variant="secondary">{t("summary.filtered")}</Badge>}
      </div>

      {filtered.length === 0 ? (
        vehicles.length === 0 ? (
          <EmptyState
            icon={<CarFront className="size-4" />}
            title={t("empty.noneTitle")}
            description={t("empty.noneDescription")}
            action={
              canCreate ? (
                <Link href="/vehicles/new" className={buttonVariants({ variant: "secondary" })}>
                  {t("actions.addVehicle")}
                </Link>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            icon={<Filter className="size-4" />}
            title={t("empty.matchTitle")}
            description={t("empty.matchDescription")}
            action={
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setMakeValue("all");
                  setCustomerValue("all");
                }}
                className={buttonVariants({ variant: "secondary" })}
              >
                {t("filters.reset")}
              </button>
            }
          />
        )
      ) : (
        <>
          <MobileDataList
            items={filtered}
            empty={null}
            getKey={(vehicle) => vehicle.id}
            renderItem={(vehicle) => (
              <MobileDataCard
                title={
                  <Link href={`/vehicles/${vehicle.id}`} className="hover:underline">
                    {vehicleLabel(vehicle)}
                  </Link>
                }
                subtitle={vehicle.customer?.full_name ?? t("fallback.noCustomer")}
                meta={
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {vehicle.plate_number && <Badge variant="outline">{vehicle.plate_number}</Badge>}
                    {vehicle.year && <Badge variant="outline">{vehicle.year}</Badge>}
                    {vehicle.vin && <span>{t("labels.vin")} {vehicle.vin}</span>}
                  </div>
                }
              >
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {vehicle.color && <span>{vehicle.color}</span>}
                  <span>
                    {t("labels.lastService")} {formatDate(vehicle.last_service_at)}
                  </span>
                </div>
              </MobileDataCard>
            )}
          />

          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.vehicle")}</TableHead>
                  <TableHead>{t("table.customer")}</TableHead>
                  <TableHead>{t("table.plate")}</TableHead>
                  <TableHead>{t("table.vin")}</TableHead>
                  <TableHead>{t("table.lastService")}</TableHead>
                  <TableHead>{t("table.updated")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((vehicle) => (
                  <TableRow key={vehicle.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col gap-1">
                        <Link href={`/vehicles/${vehicle.id}`} className="hover:underline">
                          {vehicleLabel(vehicle)}
                        </Link>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {vehicle.make && <span>{vehicle.make}</span>}
                          {vehicle.model && <span>{vehicle.model}</span>}
                          {vehicle.year && <span>{vehicle.year}</span>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {vehicle.customer?.full_name ?? t("fallback.none")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {vehicle.plate_number ?? t("fallback.none")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {vehicle.vin ?? t("fallback.none")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(vehicle.last_service_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(vehicle.updated_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
