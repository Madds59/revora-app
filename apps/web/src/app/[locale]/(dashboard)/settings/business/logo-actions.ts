"use server";

import { revalidatePath } from "next/cache";

import { requireMembership } from "@/lib/auth";
import { canManageBusiness } from "@/lib/permissions";
import { publicUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { firstValidationMessage } from "@/lib/validation/common";
import {
  businessLogoSchema,
  isOwnedLogoPath,
} from "@/lib/validation/business-settings";

export type UploadResult = { error?: string; message?: string };

export async function uploadBusinessLogo(
  formData: FormData,
): Promise<UploadResult> {
  const { member, business } = await requireMembership();
  if (!canManageBusiness(member.role))
    return { error: "Only owners can change branding." };

  // The browser uploads straight to Storage (constrained by the
  // revora_public_insert policy) and then hands the path back — so the path and
  // its metadata are untrusted input. Validate the file metadata, then confirm
  // the path really sits in this business's own branding namespace before it is
  // recorded as the logo. Traversal and cross-tenant paths are rejected.
  const parsed = businessLogoSchema.safeParse({
    objectPath: formData.get("object_path"),
    fileName: formData.get("file_name"),
    mimeType: formData.get("mime_type"),
    sizeBytes: formData.get("size_bytes"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };

  const objectPath = parsed.data.objectPath;
  if (!isOwnedLogoPath(objectPath, business.id)) {
    return { error: "That file could not be uploaded." };
  }

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
  if (error) {
    console.error("uploadBusinessLogo failed", error);
    return { error: "Could not update the logo. Please try again." };
  }

  revalidatePath("/settings/business");
  revalidatePath("/", "layout");
  return { message: "Logo updated." };
}
