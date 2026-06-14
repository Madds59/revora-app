"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import type { JobStatus } from "@/lib/database.types";

export type JobBoardRow = {
  id: string;
  title: string;
  description: string | null;
  status: JobStatus;
  created_at: string;
  expected_completion_at: string | null;
  customer_name: string;
  customer_email: string | null;
  branch_name: string | null;
};

const STATUS_VARIANT: Record<JobStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  approved: "outline",
  in_progress: "default",
  waiting_parts: "secondary",
  delayed: "destructive",
  completed: "default",
  cancelled: "outline",
};

const STATUS_LABELS: Record<JobStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  in_progress: "In progress",
  waiting_parts: "Waiting parts",
  delayed: "Delayed",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function JobsBoard({ rows }: { rows: JobBoardRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<JobStatus | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = status === "all" || row.status === status;
      const matchesQuery =
        q.length === 0 ||
        row.title.toLowerCase().includes(q) ||
        row.customer_name.toLowerCase().includes(q) ||
        row.branch_name?.toLowerCase().includes(q) ||
        (row.description ?? "").toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [query, rows, status]);

  const counts = useMemo(() => {
    const initial = Object.fromEntries(
      Object.keys(STATUS_LABELS).map((key) => [key, 0]),
    ) as Record<JobStatus, number>;
    for (const row of rows) initial[row.status] += 1;
    return initial;
  }, [rows]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <Card key={key}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="text-sm text-muted-foreground">{label}</div>
              <div className="text-2xl font-semibold tabular-nums">
                {counts[key as JobStatus]}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search jobs, customers, branches"
          className="md:max-w-sm"
        />
        <Select value={status} onValueChange={(value) => setStatus(value as JobStatus | "all")}>
          <SelectTrigger className="md:w-56">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 md:ms-auto">
          <Badge variant="secondary">{filtered.length} visible</Badge>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setStatus("all");
            }}
            disabled={query.length === 0 && status === "all"}
          >
            Reset filters
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No jobs match"
          description="Try a different search or reset the filters."
        />
      ) : (
        <>
          <MobileDataList
            items={filtered}
            empty={null}
            getKey={(row) => row.id}
            renderItem={(row) => (
              <MobileDataCard
                title={
                  <Link href={`/jobs/${row.id}`} className="hover:underline">
                    {row.title}
                  </Link>
                }
                subtitle={row.customer_name}
                meta={
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={STATUS_VARIANT[row.status]}>
                      {STATUS_LABELS[row.status]}
                    </Badge>
                    <span>{row.branch_name ?? "No branch"}</span>
                    <span>
                      {row.expected_completion_at
                        ? new Date(row.expected_completion_at).toLocaleDateString()
                        : "No due date"}
                    </span>
                  </div>
                }
              />
            )}
          />

          <div className="hidden rounded-lg border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/jobs/${row.id}`}
                      className="font-medium hover:underline"
                    >
                      {row.title}
                    </Link>
                    {row.description && (
                      <div className="text-muted-foreground text-xs">
                        {row.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>{row.customer_name}</div>
                    <div className="text-muted-foreground text-xs">
                      {row.customer_email ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.branch_name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[row.status]}>
                      {STATUS_LABELS[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.expected_completion_at
                      ? new Date(row.expected_completion_at).toLocaleDateString()
                      : "—"}
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
