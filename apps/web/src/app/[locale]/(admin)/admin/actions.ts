"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  adminMarkNotificationReadSchema,
  firstValidationMessage,
  setSuperAdminSchema,
} from "@/lib/validation/admin";

export type AdminFormState = { error?: string; message?: string };

/**
 * Grant or revoke platform administration.
 *
 * Authority is proven twice and never comes from the caller: `requireSuperAdmin()`
 * resolves the actor from the server session and checks `platform_admins`
 * (redirecting — which throws — for anonymous or non-admin callers, so invoking
 * this action directly cannot bypass the admin layout), and the SECURITY DEFINER
 * `admin_set_super_admin` RPC independently re-checks `is_super_admin()` and
 * refuses self-revocation.
 *
 * The form values are still untrusted input. The grant/revoke direction must now
 * be stated explicitly: it previously defaulted to GRANT when `make_admin` was
 * absent, so a request that simply omitted the hidden field escalated the target.
 */
export async function setSuperAdmin(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireSuperAdmin();

  const parsed = setSuperAdminSchema.safeParse({
    email: formData.get("email"),
    makeAdmin: formData.get("make_admin"),
  });
  if (!parsed.success) {
    return { error: firstValidationMessage(parsed) };
  }
  const { email, makeAdmin } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_super_admin", {
    target_email: email,
    make_admin: makeAdmin,
  });
  if (error) {
    // The RPC distinguishes "no such user" from "forbidden"; neither is echoed
    // back, so this action cannot be used to enumerate accounts.
    console.error("setSuperAdmin failed", error.code);
    return { error: "Could not update super admin status. Please try again." };
  }

  revalidatePath("/admin/admins");
  revalidatePath("/admin");
  return {
    message: makeAdmin
      ? `${email} is now a super admin.`
      : `Removed super admin from ${email}.`,
  };
}

/**
 * Mark one platform notification read. Same two-layer authority as above; the
 * id is now proven to be a UUID before it reaches the RPC, so a malformed
 * selector fails as validation rather than as a database cast error.
 */
export async function markNotificationRead(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireSuperAdmin();

  const parsed = adminMarkNotificationReadSchema.safeParse({
    notificationId: formData.get("notification_id"),
  });
  if (!parsed.success) {
    return { error: firstValidationMessage(parsed) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_mark_notification_read", {
    notification_id: parsed.data.notificationId,
  });
  if (error) {
    console.error("markNotificationRead (admin) failed", error.code);
    return { error: "Could not mark notification as read." };
  }

  revalidatePath("/admin/notifications");
  revalidatePath("/admin");
  return { message: "Notification marked as read." };
}
