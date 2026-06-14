import Link from "next/link";
import { Building2, FileCheck2, Wrench, ArrowRight } from "lucide-react";

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
  const { accounts } = await requireCustomerPortal();
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
    .order("created_at", { ascending: false });
  const pendingQuotes = (pendingData ?? []) as unknown as PendingQuote[];

  // Active jobs the customer can track (RLS-scoped).
  const { data: jobsData } = await supabase
    .from("jobs")
    .select("id, title, status, business:businesses(name)")
    .in("status", ACTIVE_JOB_STATUSES)
    .order("created_at", { ascending: false });
  const activeJobs = (jobsData ?? []) as unknown as ActiveJob[];

  return (
    <>
      <PageHeader
        title="Portal"
        description="Your linked accounts and complaint history."
        action={
          <Link href="/portal/complaints/new" className={buttonVariants()}>
            Submit complaint
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
                      {account.business?.name ?? "Business"}
                    </CardTitle>
                    <CardDescription className="truncate">
                      {account.full_name}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {account.phone ?? account.email ?? "Linked account"}
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
                Quotes awaiting your approval
              </CardTitle>
              <CardDescription>
                Review the details and approve with your digital signature.
              </CardDescription>
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
                        {quote.business?.name ?? "Workshop"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold tabular-nums">
                        {formatCurrency(quote.total, quote.currency)}
                      </span>
                      <Badge>Review &amp; approve</Badge>
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
                Active jobs
              </CardTitle>
              <CardDescription>Work currently in progress.</CardDescription>
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
                        {job.business?.name ?? "Workshop"}
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
            <CardTitle>Recent complaints</CardTitle>
            <CardDescription>
              View the current status of your active and past complaints.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {typedComplaints.length === 0 ? (
              <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
                No complaints yet.
              </div>
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
                          {complaint.business_name ?? "Business"}
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
