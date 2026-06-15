import Link from "next/link";
import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireMembership } from "@/lib/auth";
import { formatDate } from "@/lib/formatters";
import { canManageComplaints } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Complaint, Customer, Profile } from "@/lib/database.types";
import {
  COMPLAINT_SEVERITY_VARIANT,
  COMPLAINT_STATUS_VARIANT,
  getComplaintSeverityLabel,
  getComplaintStatusLabel,
} from "@/lib/complaints";

type ComplaintListItem = Complaint & {
  customer_name: string | null;
  customer_email: string | null;
  assignee_name: string | null;
};

type ComplaintListStats = {
  openCount: number;
  resolvedCount: number;
};

type ComplaintLookup = Pick<Customer, "id" | "full_name" | "email">;
type ProfileLookup = Pick<Profile, "id" | "full_name">;

function ComplaintEmptyState({
  title,
  description,
  action,
}: {
  action: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <EmptyState
      title={title}
      description={description}
      action={action}
    />
  );
}

export default async function ComplaintsPage() {
  const t = await getTranslations("dashboardComplaints");
  const locale = await getLocale();
  const { member, business } = await requireMembership();
  if (!canManageComplaints(member.role)) {
    return (
      <>
        <PageHeader title={t("title")} description={t("accessRestrictedDescription")} />
        <div className="p-6">
          <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
            {t("accessRestricted")}
          </div>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const [{ data: complaintsData }, { count: openCount }, { count: resolvedCount }] =
    await Promise.all([
      supabase
        .from("complaints")
        .select("*")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("complaints")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id)
        .in("status", [
          "open",
          "assigned",
          "awaiting_customer",
          "investigating",
          "escalated",
        ]),
      supabase
        .from("complaints")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id)
        .in("status", ["resolved", "closed"]),
    ]);

  const complaintRows = (complaintsData ?? []) as Complaint[];
  const customerIds = [...new Set(complaintRows.map((row) => row.customer_id))];
  const assigneeIds = [
    ...new Set(
      complaintRows.flatMap((row) => (row.assigned_to ? [row.assigned_to] : [])),
    ),
  ];

  const [customerResult, profileResult] = await Promise.all([
    customerIds.length
      ? supabase
          .from("customers")
          .select("id, full_name, email")
          .eq("business_id", business.id)
          .in("id", customerIds)
      : Promise.resolve({ data: [] as ComplaintLookup[] }),
    assigneeIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", assigneeIds)
      : Promise.resolve({ data: [] as ProfileLookup[] }),
  ]);

  const customerMap = new Map<string, ComplaintLookup>();
  (customerResult.data ?? []).forEach((row) => {
    customerMap.set(row.id, row);
  });

  const profileMap = new Map<string, ProfileLookup>();
  (profileResult.data ?? []).forEach((row) => {
    profileMap.set(row.id, row);
  });

  const rows: ComplaintListItem[] = complaintRows.map((row) => ({
    ...row,
    customer_name: customerMap.get(row.customer_id)?.full_name ?? null,
    customer_email: customerMap.get(row.customer_id)?.email ?? null,
    assignee_name: row.assigned_to
      ? profileMap.get(row.assigned_to)?.full_name ?? null
      : null,
  }));

  const stats: ComplaintListStats = {
    openCount: openCount ?? 0,
    resolvedCount: resolvedCount ?? 0,
  };

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="flex flex-col gap-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("stats.openActive")}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{stats.openCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("stats.resolvedClosed")}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{stats.resolvedCount}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("queue.title")}</CardTitle>
            <CardDescription>{t("queue.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <ComplaintEmptyState
                title={t("empty.title")}
                description={t("empty.description")}
                action={
                  <Link href="/portal/complaints" className={buttonVariants({ variant: "secondary" })}>
                    {t("empty.action")}
                  </Link>
                }
              />
            ) : (
              <>
                <MobileDataList
                  items={rows}
                  empty={null}
                  getKey={(complaint) => complaint.id}
                  renderItem={(complaint) => (
                    <MobileDataCard
                      title={
                        <Link href={`/complaints/${complaint.id}`} className="hover:underline">
                          {complaint.subject}
                        </Link>
                      }
                      subtitle={complaint.customer_name ?? t("fallback.noCustomer")}
                      meta={
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={COMPLAINT_STATUS_VARIANT[complaint.status]}>
                            {getComplaintStatusLabel(complaint.status, locale)}
                          </Badge>
                          <Badge variant={COMPLAINT_SEVERITY_VARIANT[complaint.severity]}>
                            {getComplaintSeverityLabel(complaint.severity, locale)}
                          </Badge>
                          <span>{formatDate(complaint.updated_at)}</span>
                        </div>
                      }
                    />
                  )}
                />

                <div className="hidden rounded-lg border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[28%]">{t("table.subject")}</TableHead>
                        <TableHead className="hidden md:table-cell">{t("table.customer")}</TableHead>
                        <TableHead>{t("table.status")}</TableHead>
                        <TableHead className="hidden lg:table-cell">{t("table.severity")}</TableHead>
                        <TableHead className="hidden xl:table-cell">{t("table.assignee")}</TableHead>
                        <TableHead className="text-end">{t("table.updated")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((complaint) => (
                        <TableRow key={complaint.id}>
                          <TableCell className="align-top">
                            <div className="flex flex-col gap-1">
                              <Link
                                href={`/complaints/${complaint.id}`}
                                className="font-medium hover:underline"
                              >
                                {complaint.subject}
                              </Link>
                              <div className="text-muted-foreground line-clamp-2 text-xs">
                                {complaint.description}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden align-top md:table-cell">
                            <div className="flex flex-col gap-1">
                              <div>{complaint.customer_name ?? t("fallback.none")}</div>
                              <div className="text-muted-foreground text-xs">
                                {complaint.customer_email ?? t("fallback.none")}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge variant={COMPLAINT_STATUS_VARIANT[complaint.status]}>
                              {getComplaintStatusLabel(complaint.status, locale)}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden align-top lg:table-cell">
                            <Badge variant={COMPLAINT_SEVERITY_VARIANT[complaint.severity]}>
                              {getComplaintSeverityLabel(complaint.severity, locale)}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden align-top text-muted-foreground xl:table-cell">
                            {complaint.assignee_name ?? t("fallback.unassigned")}
                          </TableCell>
                          <TableCell className="align-top text-end text-muted-foreground">
                            {formatDate(complaint.updated_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
