import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { requireMembership } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { Branch, Customer, Job } from "@/lib/database.types";

import { JobsBoard, type JobBoardRow } from "@/components/jobs-board";

type JobLookup = Pick<
  Job,
  | "id"
  | "title"
  | "description"
  | "status"
  | "created_at"
  | "expected_completion_at"
  | "customer_id"
  | "branch_id"
>;

type CustomerLookup = Pick<Customer, "id" | "full_name" | "email">;
type BranchLookup = Pick<Branch, "id" | "name">;

export default async function JobsPage() {
  const t = await getTranslations("dashboardJobsPage");
  const tError = await getTranslations("error");
  const { business } = await requireMembership();
  const supabase = await createClient();

  const [{ data: jobRows, error }, { data: customerRows }, { data: branchRows }] =
    await Promise.all([
      supabase
        .from("jobs")
        .select(
          "id, title, description, status, created_at, expected_completion_at, customer_id, branch_id",
        )
        .eq("business_id", business.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("customers")
        .select("id, full_name, email")
        .eq("business_id", business.id)
        .is("deleted_at", null),
      supabase.from("branches").select("id, name").eq("business_id", business.id),
    ]);
  if (error) console.error("JobsPage failed to load", error);

  const jobs = (jobRows ?? []) as JobLookup[];
  const customerMap = new Map(
    (customerRows ?? []).map((customer: CustomerLookup) => [customer.id, customer]),
  );
  const branchMap = new Map(
    (branchRows ?? []).map((branch: BranchLookup) => [branch.id, branch.name]),
  );

  const rows: JobBoardRow[] = jobs.map((job) => {
    const customer = customerMap.get(job.customer_id);
    return {
      id: job.id,
      title: job.title,
      description: job.description,
      status: job.status,
      created_at: job.created_at,
      expected_completion_at: job.expected_completion_at,
      customer_name: customer?.full_name ?? "—",
      customer_email: customer?.email ?? null,
      branch_name: job.branch_id ? branchMap.get(job.branch_id) ?? null : null,
    };
  });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />
      <div className="p-6">
        {error ? (
          <p className="text-sm text-destructive">{tError("description")}</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title={t("empty.title")}
            description={t("empty.description")}
          />
        ) : (
          <JobsBoard rows={rows} />
        )}
      </div>
    </>
  );
}
