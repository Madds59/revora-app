import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { DetailSummaryCard } from "@/components/detail-summary-card";
import { requireCustomerPortal, getUser } from "@/lib/auth";

export default async function PortalSettingsPage() {
  const { accounts } = await requireCustomerPortal();
  const user = await getUser();
  const primary = accounts[0]?.business ?? null;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Read-only profile and account details for the customer portal."
      />

      <div className="flex flex-col gap-6 p-6">
        {accounts.length === 0 ? (
          <EmptyState
            title="No linked customer account"
            description="We could not find a customer record linked to your sign-in. Use the same email address your workshop has on file, or ask them to invite/link you."
          />
        ) : (
          <>
            <DetailSummaryCard
              title="Signed-in account"
              description="The email and linked customer records associated with this portal account."
              rows={[
                { label: "Email", value: user?.email ?? "—" },
                {
                  label: "Linked records",
                  value: `${accounts.length} customer account${accounts.length === 1 ? "" : "s"}`,
                },
                {
                  label: "Primary workshop",
                  value: primary?.name ?? "—",
                  note: primary?.legal_name ?? undefined,
                },
              ]}
              status={{ label: "Read-only" }}
            />

            <Card>
              <CardHeader>
                <CardTitle>Linked customer accounts</CardTitle>
                <CardDescription>
                  These records are available through the portal and are kept separate by tenant.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {accounts.map((account) => (
                  <div key={account.id} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-medium">{account.full_name}</div>
                        <div className="text-muted-foreground text-xs">
                          {account.email ?? "No email"}
                        </div>
                      </div>
                      <Badge variant="outline">{account.business?.name ?? "Workshop"}</Badge>
                    </div>
                    <dl className="mt-3 grid gap-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Phone</dt>
                        <dd>{account.phone ?? "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Language</dt>
                        <dd>{account.preferred_language}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Created</dt>
                        <dd>{new Date(account.created_at).toLocaleDateString()}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Security and communication</CardTitle>
                <CardDescription>
                  Portal access is linked to your signed-in email. Editable customer settings are not enabled yet.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Communication preferences, delivery channels, and account edits are managed by the workshop for now.
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
