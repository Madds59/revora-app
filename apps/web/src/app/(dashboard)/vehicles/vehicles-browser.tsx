"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  return [vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.plate_number || vehicle.vin || "Vehicle";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
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
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-end md:justify-between">
      <div className="grid flex-1 gap-3 md:grid-cols-2">
        <div className="grid gap-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Make
          </div>
          <Select value={makeValue} onValueChange={(value) => onMakeValueChange(value ?? "all")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All makes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All makes</SelectItem>
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
            Customer
          </div>
          <Select value={customerValue} onValueChange={(value) => onCustomerValueChange(value ?? "all")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All customers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All customers</SelectItem>
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
        Reset filters
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
        searchPlaceholder="Search plate, make, model, customer, or VIN"
        searchValue={search}
        onSearchValueChange={setSearch}
        action={
          canCreate ? (
            <Link href="/vehicles/new" className={buttonVariants()}>
              Add vehicle
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
        <span>
          Showing {filtered.length} of {vehicles.length} vehicles
        </span>
        {hasFilters && <Badge variant="secondary">Filtered</Badge>}
      </div>

      {filtered.length === 0 ? (
        vehicles.length === 0 ? (
          <EmptyState
            icon={<CarFront className="size-4" />}
            title="No vehicles yet"
            description="Add the first vehicle to start linking service history, quotes, and documents."
            action={
              canCreate ? (
                <Link href="/vehicles/new" className={buttonVariants({ variant: "secondary" })}>
                  Add vehicle
                </Link>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            icon={<Filter className="size-4" />}
            title="No vehicles match"
            description="Try a different search term or clear the filters."
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
                Reset filters
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
                subtitle={vehicle.customer?.full_name ?? "No linked customer"}
                meta={
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {vehicle.plate_number && <Badge variant="outline">{vehicle.plate_number}</Badge>}
                    {vehicle.year && <Badge variant="outline">{vehicle.year}</Badge>}
                    {vehicle.vin && <span>VIN {vehicle.vin}</span>}
                  </div>
                }
              >
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {vehicle.color && <span>{vehicle.color}</span>}
                  <span>Last service {formatDate(vehicle.last_service_at)}</span>
                </div>
              </MobileDataCard>
            )}
          />

          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Plate</TableHead>
                  <TableHead>VIN</TableHead>
                  <TableHead>Last service</TableHead>
                  <TableHead>Updated</TableHead>
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
                      {vehicle.customer?.full_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {vehicle.plate_number ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {vehicle.vin ?? "—"}
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
