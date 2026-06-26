"use server";

import { revalidatePath } from "next/cache";

import { getUser, requireMembership } from "@/lib/auth";
import { canManageSettings } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export type NotificationActionState = { error?: string; message?: string };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function checked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

export async function markBusinessNotificationRead(
  _prev: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  await requireMembership();
  const notificationId = str(formData, "notification_id");
  if (!notificationId) return { error: "Notification id is required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_business_notification_read", {
    target_notification_id: notificationId,
  });
  if (error) {
    console.error("markBusinessNotificationRead failed", error);
    return { error: "Could not mark notification as read." };
  }

  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { message: "Notification marked as read." };
}

export async function markAllBusinessNotificationsRead(
  _prev: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const { business } = await requireMembership();
  const targetBusinessId = str(formData, "business_id") || business.id;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_business_notifications_read", {
    target_business_id: targetBusinessId,
  });
  if (error) {
    console.error("markAllBusinessNotificationsRead failed", error);
    return { error: "Could not mark notifications as read." };
  }

  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return {
    message: `${data ?? 0} notification${data === 1 ? "" : "s"} marked as read.`,
  };
}

export async function updateBusinessNotificationSettings(
  _prev: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const { member, business } = await requireMembership();
  if (!canManageSettings(member.role)) {
    return { error: "You don't have permission to manage notification settings." };
  }

  const user = await getUser();
  const supabase = await createClient();
  const { error } = await supabase.from("business_notification_settings").upsert(
    {
      business_id: business.id,
      email_enabled: checked(formData, "email_enabled"),
      live_send_enabled: checked(formData, "live_send_enabled"),
      sms_enabled: checked(formData, "sms_enabled"),
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    },
    { onConflict: "business_id" },
  );
  if (error) {
    console.error("updateBusinessNotificationSettings failed", error);
    return { error: "Could not update notification settings." };
  }

  revalidatePath("/notifications");
  return { message: "Notification settings updated." };
}
