"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { ACTIVE_BUSINESS_COOKIE, getCurrentMemberships } from "@/lib/auth";

export type FormState = { error?: string; message?: string };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function setActiveBusiness(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const businessId = str(formData, "business_id");
  if (!businessId) return { error: "Select a business to continue." };

  const memberships = await getCurrentMemberships();
  if (!memberships.some((membership) => membership.business.id === businessId)) {
    return { error: "You are not a member of that business." };
  }

  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  revalidatePath("/", "layout");
  return { message: "Active business switched." };
}
