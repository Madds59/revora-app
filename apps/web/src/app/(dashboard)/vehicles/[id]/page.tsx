import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { DetailSummaryCard } from "@/components/detail-summary-card";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
import { canManageCustomers } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Complaint, Document, Job, Quotation, Vehicle } from "@/lib/database.types";
import { JOB_STATUS_LABELS, JOB_STATUS_VARIANT } from "@/lib/jobs";
import { COMPLAINT_SEVERITY_LABELS, COMPLAINT_STATUS_LABELS, COMPLAINT_STATUS_VARIANT } from "@/lib/complaints";
import { QUOTE_STATUS_VARIANT } from "@/app/(dashboard)/quotations/status";

type VehicleDetailRow = Pick<
  Vehicle,
  | "id"
  | "customer_id"
  | "make"
  | "model"
  | "year"
  | "plate_number"
  | "vin"
  | "color"
  | "metadata"
  | "created_at"
  | "updated_at"
> & {
  customer: {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
  } | null;
};

type VehicleJobRow = Pick<
  Job,
  "id" | "title" | "status" | "created_at" | "completed_at" | "expected_completion_at" | "quotation_id"
> & {
  quotation: { quote_number: string | null } | null;
};

type VehicleQuoteRow = Pick<
  Quotation,
  "id" | "quote_number" | "status" | "total" | "currency" | "created_at" | "vehicle_id"
>;

type VehicleComplaintRow = Pick<
  Complaint,
  "id" | "subject" | "status" | "severity" | "created_at"
>;

type VehicleDocumentRow = Pick<
  Document,
  "id" | "title" | "document_type" | "created_at" | "customer_id" | "quotation_id" | "job_id"
> & {
  quotation: { vehicle_id: string | null; quote_number: string | null } | null;
  job: { title: string | null } | null;
  customer: { full_name: string | null } | null;
};

function vehicleLabel(vehicle: VehicleDetailRow) {
  return [vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.plate_number || vehicle.vin || "Vehicle";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member, business } = await requireMembership();
  const canManage = canManageCustomers(member.role);
  const supabase = await createClient();

  const { data: vehicleRow, error: vehicleError } = await supabase
    .from("vehicles")
    .select(
      "id, customer_id, make, model, year, plate_number, vin, color, metadata, created_at, updated_at, customer:customers(id, full_name, phone, email)",
    )
    .eq("business_id", business.id)
    .eq("id", id)
    .maybeSingle();

  if (vehicleError) {
    throw vehicleError;
  }
  if (!vehicleRow) notFound();

  const vehicle = vehicleRow as unknown as VehicleDetailRow;

  const [
    { data: jobRows, error: jobError },
    { data: quoteRows, error: quoteError },
    { data: complaintRows, error: complaintError },
    { data: documentRows, error: documentError },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, title, status, created_at, completed_at, expected_completion_at, quotation_id, quotation:quotations(quote_number)",
      )
      .eq("business_id", business.id)
      .eq("customer_id", vehicle.customer_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("quotations")
      .select("id, quote_number, status, total, currency, created_at, vehicle_id")
      .eq("business_id", business.id)
      .eq("vehicle_id", vehicle.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("complaints")
      .select("id, subject, status, severity, created_at")
      .eq("business_id", business.id)
      .eq("customer_id", vehicle.customer_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("documents")
      .select(
        "id, title, document_type, created_at, customer_id, quotation_id, job_id, customer:customers(full_name), quotation:quotations(vehicle_id, quote_number), job:jobs(title)",
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false }),
  ]);

  const jobs = (jobRows ?? []) as unknown as VehicleJobRow[];
  const quotes = (quoteRows ?? []) as unknown as VehicleQuoteRow[];
  const complaints = (complaintRows ?? []) as unknown as VehicleComplaintRow[];
  const documents = (documentRows ?? []) as unknown as VehicleDocumentRow[];

  const jobIds = new Set(jobs.map((job) => job.id));
  const relatedDocuments = documents.filter(
    (doc) =>
      doc.customer_id === vehicle.customer_id ||
      (doc.quotation?.vehicle_id ?? null) === vehicle.id ||
      (doc.job_id ? jobIds.has(doc.job_id) : false),
  );

  return (
    <>
      <PageHeader
        title={vehicleLabel(vehicle)}
        description={
          [vehicle.customer?.full_name, vehicle.plate_number, vehicle.vin]
            .filter(Boolean)
            .join(" · ") || "Vehicle details"
        }
        action={
          <Link href="/vehicles" className={buttonVariants({ variant: "outline" })}>
            Back to vehicles
          </Link>
        }
      />

      <div className="flex flex-col gap-6 p-6">
        <DetailSummaryCard
          title="Vehicle summary"
          description="Core vehicle profile and ownership details."
          rows={[
            { label: "Customer", value: vehicle.customer?.full_name ?? "Unlinked" },
            { label: "Make", value: vehicle.make ?? "—" },
            { label: "Model", value: vehicle.model ?? "—" },
            { label: "Year", value: vehicle.year ?? "—" },
            { label: "Plate", value: vehicle.plate_number ?? "—" },
            { label: "VIN", value: vehicle.vin ?? "—" },
            { label: "Color", value: vehicle.color ?? "—" },
            { label: "Created", value: formatDateTime(vehicle.created_at) },
            { label: "Updated", value: formatDateTime(vehicle.updated_at) },
          ]}
          status={{ label: vehicle.customer ? "Linked" : "Unlinked", variant: vehicle.customer ? "default" : "outline" }}
          action={
            <div className="flex flex-wrap gap-2">
              <Link href={`/customers/${vehicle.customer_id}`} className={buttonVariants({ variant: "outline" })}>
                View customer
              </Link>
              {canManage && (
                <Link href={`/vehicles/${vehicle.id}/edit`} className={buttonVariants({ variant: "secondary" })}>
                  Edit vehicle
                </Link>
              )}
            </div>
          }
        />

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Service history</CardTitle>
              <CardDescription>Jobs recorded against the linked customer.</CardDescription>
            </CardHeader>
            <CardContent>
              {jobError ? (
                <p className="text-sm text-destructive">{jobError.message}</p>
              ) : jobs.length === 0 ? (
                <EmptyState
                  title="No jobs yet"
                  description="Jobs for this customer will appear here once they are created."
                />
              ) : (
                <>
                  <MobileDataList
                    items={jobs}
                    empty={null}
                    getKey={(job) => job.id}
                    renderItem={(job) => (
                      <MobileDataCard
                        title={job.title}
                        subtitle={job.quotation?.quote_number ?? "No quote"}
                        meta={
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={JOB_STATUS_VARIANT[job.status]}>
                              {JOB_STATUS_LABELS[job.status]}
                            </Badge>
                            <span>{formatDate(job.expected_completion_at)}</span>
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
                          <TableHead>Status</TableHead>
                          <TableHead>Quote</TableHead>
                          <TableHead>Due</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {jobs.map((job) => (
                          <TableRow key={job.id}>
                            <TableCell className="font-medium">{job.title}</TableCell>
                            <TableCell>
                              <Badge variant={JOB_STATUS_VARIANT[job.status]}>
                                {JOB_STATUS_LABELS[job.status]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {job.quotation?.quote_number ?? "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(job.expected_completion_at)}
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

          <Card>
            <CardHeader>
              <CardTitle>Related quotes</CardTitle>
              <CardDescription>Quotes that reference this vehicle.</CardDescription>
            </CardHeader>
            <CardContent>
              {quoteError ? (
                <p className="text-sm text-destructive">{quoteError.message}</p>
              ) : quotes.length === 0 ? (
                <EmptyState
                  title="No quotes yet"
                  description="Quotes will appear here when they are linked to this vehicle."
                />
              ) : (
                <>
                  <MobileDataList
                    items={quotes}
                    empty={null}
                    getKey={(quote) => quote.id}
                    renderItem={(quote) => (
                      <MobileDataCard
                        title={
                          <Link href={`/quotations/${quote.id}`} className="hover:underline">
                            {quote.quote_number}
                          </Link>
                        }
                        subtitle={formatDate(quote.created_at)}
                        meta={
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={QUOTE_STATUS_VARIANT[quote.status]}>
                              {quote.status}
                            </Badge>
                            <span>{new Intl.NumberFormat("en", { style: "currency", currency: quote.currency }).format(quote.total)}</span>
                          </div>
                        }
                      />
                    )}
                  />

                  <div className="hidden rounded-lg border md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Quote</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {quotes.map((quote) => (
                          <TableRow key={quote.id}>
                            <TableCell className="font-medium">
                              <Link href={`/quotations/${quote.id}`} className="hover:underline">
                                {quote.quote_number}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Badge variant={QUOTE_STATUS_VARIANT[quote.status]}>
                                {quote.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Intl.NumberFormat("en", { style: "currency", currency: quote.currency }).format(quote.total)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(quote.created_at)}
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

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Related complaints</CardTitle>
              <CardDescription>Complaints filed by the linked customer.</CardDescription>
            </CardHeader>
            <CardContent>
              {complaintError ? (
                <p className="text-sm text-destructive">{complaintError.message}</p>
              ) : complaints.length === 0 ? (
                <EmptyState
                  title="No complaints yet"
                  description="Complaints from the same customer will appear here."
                />
              ) : (
                <div className="grid gap-3">
                  {complaints.map((complaint) => (
                    <div key={complaint.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/complaints/${complaint.id}`} className="font-medium hover:underline">
                          {complaint.subject}
                        </Link>
                        <Badge variant={COMPLAINT_STATUS_VARIANT[complaint.status]}>
                          {COMPLAINT_STATUS_LABELS[complaint.status]}
                        </Badge>
                        <Badge variant="outline">
                          {COMPLAINT_SEVERITY_LABELS[complaint.severity]}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground mt-2 text-xs">
                        {formatDate(complaint.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Related documents</CardTitle>
              <CardDescription>Files linked to the customer, jobs, or quotes.</CardDescription>
            </CardHeader>
            <CardContent>
              {documentError ? (
                <p className="text-sm text-destructive">{documentError.message}</p>
              ) : relatedDocuments.length === 0 ? (
                <EmptyState
                  title="No documents yet"
                  description="Documents will appear here when they are linked to this vehicle's customer or related records."
                />
              ) : (
                <div className="grid gap-3">
                  {relatedDocuments.map((document) => (
                    <div key={document.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium">{document.title}</div>
                        <Badge variant="outline">{document.document_type}</Badge>
                      </div>
                      <div className="text-muted-foreground mt-1 text-sm">
                        {document.customer?.full_name ?? document.quotation?.quote_number ?? document.job?.title ?? "Linked record"}
                      </div>
                      <div className="text-muted-foreground mt-2 text-xs">
                        {formatDate(document.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
