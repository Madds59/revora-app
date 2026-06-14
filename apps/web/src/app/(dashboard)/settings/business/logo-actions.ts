"use server";

import { revalidatePath } from "next/cache";

import { requireMembership } from "@/lib/auth";
import { canManageBusiness } from "@/lib/permissions";
import { publicUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export type UploadResult = { error?: string; message?: string };

export async function uploadBusinessLogo(
  formData: FormData,
): Promise<UploadResult> {
  const { member, business } = await requireMembership();
  if (!canManageBusiness(member.role))
    return { error: "Only owners can change branding." };

  const objectPath = String(formData.get("object_path") ?? "");
  if (!objectPath) return { error: "Missing upload." };

  const url = publicUrl(objectPath);
  const branding = {
    ...((business.branding as Record<string, unknown>) ?? {}),
    logo_url: url,
    logo_path: objectPath,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({ branding })
    .eq("id", business.id);
  if (error) return { error: error.message };

  revalidatePath("/settings/business");
  revalidatePath("/", "layout");
  return { message: "Logo updated." };
}
