import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { requireMembership } from "@/lib/auth";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { NotificationEvent } from "@/lib/database.types";
import { canManageSettings } from "@/lib/permissions";

import { NotificationSettingsForm } from "./notification-settings-form";
import { NotificationsPanel, type DashboardNotificationRow } from "./notifications-panel";

type NotificationRow = NotificationEvent & {
  customer: { full_name: string | null; email: string | null } | null;
};

type NotificationSettingsRow = {
  email_enabled: boolean;
  live_send_enabled: boolean;
  sms_enabled: boolean;
} | null;

export default async function NotificationsPage() {
  const { business, member } = await requireMembership();
  const locale = await getLocale();
  const supabase = await createClient();

  const [{ data, error }, { data: settingsData, error: settingsError }] =
    await Promise.all([
      supabase
        .from("notification_events")
        .select(
          "id, business_id, customer_id, channel, template_key, payload, status, provider_message_id, scheduled_for, sent_at, failed_at, failure_reason, read_at, read_by, created_at, recipient_email, recipient_phone, recipient_name, locale, attempt_count, last_attempt_at, customer:customers(full_name, email)",
        )
        .eq("business_id", business.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("business_notification_settings")
        .select("email_enabled, sms_enabled, live_send_enabled")
        .eq("business_id", business.id)
        .maybeSingle(),
    ]);

  const notifications = (data ?? []) as unknown as NotificationRow[];
  const settings = (settingsData ?? null) as NotificationSettingsRow;
  const typedNotifications: DashboardNotificationRow[] = notifications.map((row) => ({
    ...row,
    customer: row.customer ?? null,
  }));

  return (
    <>
      <PageHeader
        title={locale === "ar" ? "الإشعارات" : "Notifications"}
        description={
          locale === "ar"
            ? "إشعارات المستأجر، وحالة التسليم، وتتبع القراءة."
            : "Tenant notifications, delivery state, and read tracking."
        }
      />

      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {locale === "ar" ? "إعدادات البريد والرسائل النصية" : "Email and SMS settings"}
            </CardTitle>
            <CardDescription>
              {locale === "ar"
                ? "القنوات معطلة افتراضيًا. لا يتم إرسال أي رسالة حقيقية إلا عند تفعيل القناة والإرسال المباشر مع توفر إعدادات المزود."
                : "Channels are disabled by default. Revora sends nothing live unless the channel, live sending, and provider configuration are all enabled."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {settingsError ? (
              <p className="text-sm text-destructive">{settingsError.message}</p>
            ) : (
              <NotificationSettingsForm
                canManage={canManageSettings(member.role)}
                defaults={{
                  emailEnabled: Boolean(settings?.email_enabled),
                  liveSendEnabled: Boolean(settings?.live_send_enabled),
                  smsEnabled: Boolean(settings?.sms_enabled),
                }}
                labels={{
                  disabledHint:
                    locale === "ar"
                      ? "عند التعطيل، تُسجل الأحداث كمتخطاة بدون إرسال."
                      : "When disabled, events are logged as skipped without sending.",
                  email: locale === "ar" ? "البريد الإلكتروني" : "Email",
                  liveSend: locale === "ar" ? "تفعيل الإرسال المباشر" : "Enable live sending",
                  liveSendDescription:
                    locale === "ar"
                      ? "يتطلب أيضًا مفاتيح المزود في البيئة. اتركه معطلاً في المعاينة والتطوير."
                      : "Also requires provider environment keys. Keep disabled in preview and development.",
                  noOpHint:
                    locale === "ar"
                      ? "الوضع الآمن الافتراضي هو التسجيل فقط بدون إرسال حقيقي."
                      : "Safe default is audit-only logging with no real delivery.",
                  save: locale === "ar" ? "حفظ الإعدادات" : "Save settings",
                  sms: locale === "ar" ? "رسائل SMS" : "SMS",
                }}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{locale === "ar" ? "مركز الإشعارات" : "Notification center"}</CardTitle>
            <CardDescription>
              {locale === "ar"
                ? "إشعارات النشاط عبر عروض الأسعار والشكاوى والمهام والفوترة."
                : "Business notifications across quotes, complaints, jobs, and billing."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error ? (
              <p className="text-sm text-destructive">{error.message}</p>
            ) : notifications.length === 0 ? (
              <EmptyState
                title={locale === "ar" ? "لا توجد إشعارات لهذا النشاط بعد" : "No tenant notifications yet"}
                description={
                  locale === "ar"
                    ? "لا يحتوي هذا النشاط على أي أحداث إشعار مهيأة بعد."
                    : "This business does not have any notification events configured yet."
                }
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
