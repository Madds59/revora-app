import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { NotificationEvent } from "@/lib/database.types";

import { NotificationsPanel, type DashboardNotificationRow } from "./notifications-panel";

type NotificationRow = NotificationEvent & {
  customer: { full_name: string | null; email: string | null } | null;
};

export default async function NotificationsPage() {
  const { business } = await requireMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notification_events")
    .select(
      "id, business_id, customer_id, channel, template_key, payload, status, provider_message_id, scheduled_for, sent_at, failed_at, failure_reason, read_at, read_by, created_at, customer:customers(full_name, email)",
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  const notifications = (data ?? []) as unknown as NotificationRow[];
  const typedNotifications: DashboardNotificationRow[] = notifications.map((row) => ({
    ...row,
    customer: row.customer ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Tenant notifications, delivery state, and read tracking."
      />

      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Notification center</CardTitle>
            <CardDescription>
              Business notifications across quotes, complaints, jobs, and billing.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error ? (
              <p className="text-sm text-destructive">{error.message}</p>
            ) : notifications.length === 0 ? (
              <EmptyState
                title="No tenant notifications yet"
                description="This business does not have any notification events configured yet."
              />
            ) : (
              <NotificationsPanel
                businessId={business.id}
                notifications={typedNotifications}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
