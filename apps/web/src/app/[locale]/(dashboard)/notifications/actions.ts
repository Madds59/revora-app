"use server";

import { revalidatePath } from "next/cache";

import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type NotificationActionState = { error?: string; message?: string };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
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
  if (error) return { error: error.message };

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
  if (error) return { error: error.message };

  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return {
    message: `${data ?? 0} notification${data === 1 ? "" : "s"} marked as read.`,
  };
}
