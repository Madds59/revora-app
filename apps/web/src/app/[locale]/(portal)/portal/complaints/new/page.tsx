import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCustomerPortal } from "@/lib/auth";
import { ComplaintSubmissionForm } from "@/components/complaint-submission-form";
import Link from "next/link";

import { createComplaint } from "../../actions";

export default async function NewComplaintPage() {
  const { accounts } = await requireCustomerPortal();

  return (
    <>
      <PageHeader
        title="Submit complaint"
        description="Send a new complaint to the business team."
      />
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Complaint details</CardTitle>
          </CardHeader>
          <CardContent>
            {accounts.length === 0 ? (
              <div className="flex flex-col gap-3">
                <p className="text-muted-foreground text-sm">
                  No linked customer account is available for complaint
                  submission.
                </p>
                <Link href="/portal" className={buttonVariants({ variant: "outline" })}>
                  Back to portal
                </Link>
              </div>
            ) : (
              <ComplaintSubmissionForm
                action={createComplaint}
                accounts={accounts.map((account) => ({
                  customer_id: account.id,
                  business_id: account.business_id,
                  label: `${account.business?.name ?? "Business"} · ${account.full_name}`,
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
