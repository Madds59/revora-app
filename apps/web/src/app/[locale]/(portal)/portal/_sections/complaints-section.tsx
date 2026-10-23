import Link from "next/link";
import { getTranslations } from "next-intl/server";

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
import { createClient } from "@/lib/supabase/server";
import { reportError } from "@/lib/observability";
import type { Business, Complaint } from "@/lib/database.types";
import {
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_STATUS_VARIANT,
} from "@/lib/complaints";

type ComplaintRow = Complaint & { business_name: string | null };

export async function ComplaintsSection({
  customerIds,
}: {
  customerIds: string[];
}) {
  const t = await getTranslations("portalHome");
  const supabase = await createClient();

  const { data: complaintsData, error } = await supabase
    .from("complaints")
    .select("*")
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });
  if (error) {
    reportError(error, { section: "portal", extra: { part: "complaints" } });
  }

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

  return (
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
  );
}
