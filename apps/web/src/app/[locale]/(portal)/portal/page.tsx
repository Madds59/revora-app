import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Building2, FileCheck2, Wrench, ArrowRight } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
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
import { requireCustomerPortal } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/money";
import {
  ACTIVE_JOB_STATUSES,
  JOB_STATUS_LABELS,
  JOB_STATUS_VARIANT,
} from "@/lib/jobs";
import type { Business, Complaint, Job, Quotation } from "@/lib/database.types";
import {
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_STATUS_VARIANT,
} from "@/lib/complaints";

type PendingQuote = Pick<
  Quotation,
  "id" | "quote_number" | "total" | "currency"
> & { business: { name: string } | null };

type ActiveJob = Pick<Job, "id" | "title" | "status"> & {
  business: { name: string } | null;
};

type ComplaintRow = Complaint & { business_name: string | null };

export default async function PortalHomePage() {
  const t = await getTranslations("portalHome");
  const { accounts } = await requireCustomerPortal();
  if (accounts.length === 0) {
    return (
      <>
        <PageHeader
          title={t("title")}
          description={t("description")}
        />
        <div className="p-6">
          <EmptyState
            title={t("noLinkedAccountTitle")}
            description={t("noLinkedAccountDescription")}
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

  const typedComplaints: ComplaintRow[] = complaints.map((complaint) => ({
    ...complaint,
    business_name: businessMap.get(complaint.business_id) ?? null,
  }));

  // Quotes sent to this customer and awaiting their approval (RLS-scoped).
  const { data: pendingData } = await supabase
    .from("quotations")
    .select("id, quote_number, total, currency, business:businesses(name)")
    .eq("status", "sent")
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });
  const pendingQuotes = (pendingData ?? []) as unknown as PendingQuote[];

  // Active jobs the customer can track (RLS-scoped).
  const { data: jobsData } = await supabase
    .from("jobs")
    .select("id, title, status, business:businesses(name)")
    .in("status", ACTIVE_JOB_STATUSES)
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });
  const activeJobs = (jobsData ?? []) as unknown as ActiveJob[];

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
          <Link href="/portal/complaints/new" className={buttonVariants()}>
            {t("submitComplaint")}
          </Link>
        }
      />
      <div className="flex flex-col gap-6 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <Building2 className="size-4" />
                  </span>
                  <div className="grid min-w-0 gap-0.5">
                    <CardTitle className="truncate">
                      {account.business?.name ?? t("business")}
                    </CardTitle>
                    <CardDescription className="truncate">
                      {account.full_name}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {account.phone ?? account.email ?? t("linkedAccount")}
              </CardContent>
            </Card>
          ))}
        </div>

        {pendingQuotes.length > 0 && (
          <Card className="border-primary/25 overflow-hidden">
            <div aria-hidden className="uae-flag-stripe h-1 w-full" />
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck2 className="text-primary size-5" />
                {t("quotesAwaitingApproval")}
              </CardTitle>
              <CardDescription>{t("reviewAndApproveDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {pendingQuotes.map((quote) => (
                  <Link
                    key={quote.id}
                    href={`/portal/quotes/${quote.id}`}
                    className="hover:border-primary/40 hover:bg-primary/[0.04] flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 transition-colors"
                  >
                    <div>
                      <div className="font-medium">{quote.quote_number}</div>
                      <div className="text-muted-foreground text-xs">
                        {quote.business?.name ?? t("workshop")}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold tabular-nums">
                        {formatCurrency(quote.total, quote.currency)}
                      </span>
                      <Badge>{t("reviewAndApprove")}</Badge>
                      <ArrowRight className="text-muted-foreground size-4 rtl:rotate-180" />
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {activeJobs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="text-primary size-5" />
                {t("activeJobs")}
              </CardTitle>
              <CardDescription>{t("workInProgress")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {activeJobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/portal/jobs/${job.id}`}
                    className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 transition-colors"
                  >
                    <div>
                      <div className="font-medium">{job.title}</div>
                      <div className="text-muted-foreground text-xs">
                        {job.business?.name ?? t("workshop")}
                      </div>
                    </div>
                    <Badge variant={JOB_STATUS_VARIANT[job.status]}>
                      {JOB_STATUS_LABELS[job.status]}
                    </Badge>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t("recentComplaints")}</CardTitle>
            <CardDescription>{t("complaintsDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {typedComplaints.length === 0 ? (
              <EmptyState
                title={t("noComplaintsYet")}
                description={t("complaintsEmpty")}
                action={
                  <Link
                    href="/portal/complaints/new"
                    className={buttonVariants({ variant: "secondary" })}
                  >
                    {t("submitComplaintSecondary")}
                  </Link>
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                {typedComplaints.map((complaint) => (
                  <Link
                    key={complaint.id}
                    href={`/portal/complaints/${complaint.id}`}
                    className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{complaint.subject}</div>
                        <div className="text-muted-foreground text-xs">
                          {complaint.business_name ?? t("business")}
                        </div>
                      </div>
                      <Badge variant={COMPLAINT_STATUS_VARIANT[complaint.status]}>
                        {COMPLAINT_STATUS_LABELS[complaint.status]}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
