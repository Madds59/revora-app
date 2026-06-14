"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type AdminFormState = { error?: string; message?: string };

export async function setSuperAdmin(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireSuperAdmin();

  const email = String(formData.get("email") ?? "").trim();
  const makeAdmin = String(formData.get("make_admin") ?? "true") === "true";
  if (!email) return { error: "Email is required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_super_admin", {
    target_email: email,
    make_admin: makeAdmin,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/admins");
  revalidatePath("/admin");
  return {
    message: makeAdmin
      ? `${email} is now a super admin.`
      : `Removed super admin from ${email}.`,
  };
}

export async function markNotificationRead(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireSuperAdmin();

  const notificationId = String(formData.get("notification_id") ?? "").trim();
  if (!notificationId) return { error: "Notification id is required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_mark_notification_read", {
    notification_id: notificationId,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/notifications");
  revalidatePath("/admin");
  return { message: "Notification marked as read." };
}
