import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireCustomerPortal } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import type { Business, Complaint } from "@/lib/database.types";
import {
  COMPLAINT_SEVERITY_VARIANT,
  COMPLAINT_STATUS_VARIANT,
  getComplaintSeverityLabel,
  getComplaintStatusLabel,
} from "@/lib/complaints";

type ComplaintRow = Complaint & { business_name: string | null };

export default async function PortalComplaintsPage() {
  const t = await getTranslations("portalComplaints");
  const locale = await getLocale();
  const { accounts } = await requireCustomerPortal();
  if (accounts.length === 0) {
    return (
      <>
        <PageHeader title={t("title")} description={t("description")} />
        <div className="p-6">
          <EmptyState
            title={t("empty.noLinkedTitle")}
            description={t("empty.noLinkedDescription")}
            action={
              <Link href="/portal/complaints/new" className={buttonVariants()}>
                {t("actions.submitComplaint")}
              </Link>
            }
          />
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const customerIds = accounts.map((account) => account.id);

  const { data: complaintsData } = await supabase
    .from("complaints")
    .select("*")
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });

  const complaints = (complaintsData ?? []) as Complaint[];
  const businessIds = [...new Set(complaints.map((complaint) => complaint.business_id))];
  const { data: businessData } = businessIds.length
    ? await supabase.from("businesses").select("id, name").in("id", businessIds)
    : { data: [] as Pick<Business, "id" | "name">[] };
  const businessMap = new Map(
    (businessData ?? []).map((business) => [business.id, business.name]),
  );

  const rows: ComplaintRow[] = complaints.map((complaint) => ({
    ...complaint,
    business_name: businessMap.get(complaint.business_id) ?? null,
  }));

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
          <Link href="/portal/complaints/new" className={buttonVariants()}>
            {t("actions.submitComplaint")}
          </Link>
        }
      />
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("history.title")}</CardTitle>
            <CardDescription>{t("history.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <EmptyState
                title={t("empty.noComplaintsTitle")}
                description={t("empty.noComplaintsDescription")}
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
                        <Link href={`/portal/complaints/${complaint.id}`} className="font-medium hover:underline">
                          {complaint.subject}
                        </Link>
                      }
                      subtitle={complaint.business_name ?? t("fallback.workshop")}
                      meta={
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={COMPLAINT_STATUS_VARIANT[complaint.status]}>
                            {getComplaintStatusLabel(complaint.status, locale)}
                          </Badge>
                          <Badge variant={COMPLAINT_SEVERITY_VARIANT[complaint.severity]}>
                            {getComplaintSeverityLabel(complaint.severity, locale)}
                          </Badge>
                        </div>
                      }
                    />
                  )}
                />

                <div className="hidden rounded-lg border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("table.subject")}</TableHead>
                        <TableHead>{t("table.workshop")}</TableHead>
                        <TableHead>{t("table.status")}</TableHead>
                        <TableHead>{t("table.severity")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((complaint) => (
                        <TableRow key={complaint.id}>
                          <TableCell>
                            <Link
                              href={`/portal/complaints/${complaint.id}`}
                              className="font-medium hover:underline"
                            >
                              {complaint.subject}
                            </Link>
                          </TableCell>
                          <TableCell>{complaint.business_name ?? t("fallback.none")}</TableCell>
                          <TableCell>
                            <Badge variant={COMPLAINT_STATUS_VARIANT[complaint.status]}>
                              {getComplaintStatusLabel(complaint.status, locale)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={COMPLAINT_SEVERITY_VARIANT[complaint.severity]}>
                              {getComplaintSeverityLabel(complaint.severity, locale)}
                            </Badge>
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
