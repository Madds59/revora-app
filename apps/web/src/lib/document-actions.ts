"use server";

import { revalidatePath } from "next/cache";

import { getUser, requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type UploadResult = { error?: string; message?: string };

export type DocumentContext = {
  documentType?: string;
  title?: string;
  customerId?: string | null;
  quotationId?: string | null;
  complaintId?: string | null;
  jobId?: string | null;
  revalidate?: string[];
};

/**
 * Records a staff-uploaded file as a media_asset + documents row. Staff can
 * insert both under RLS (media_assets_insert_members / documents_insert_staff),
 * so no SECURITY DEFINER needed. Bind the context (links + type) at the call site.
 */
export async function uploadDocument(
  context: DocumentContext,
  formData: FormData,
): Promise<UploadResult> {
  const { business } = await requireMembership();
  const objectPath = String(formData.get("object_path") ?? "");
  const fileName = String(formData.get("file_name") ?? "");
  const mimeType = String(formData.get("mime_type") ?? "");
  const sizeBytes = Number(formData.get("size_bytes") ?? 0);
  if (!objectPath) return { error: "Missing upload." };

  const user = await getUser();
  const supabase = await createClient();

  const { data: media, error: mediaError } = await supabase
    .from("media_assets")
    .insert({
      business_id: business.id,
      bucket: "revora-private",
      object_path: objectPath,
      file_name: fileName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      purpose: context.documentType ?? "document",
      visibility: "private",
      uploaded_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (mediaError || !media) {
    if (mediaError) console.error("uploadDocument (media_assets) failed", mediaError);
    return { error: "Could not record the file." };
  }

  const { error: docError } = await supabase.from("documents").insert({
    business_id: business.id,
    media_asset_id: media.id,
    document_type: context.documentType ?? "file",
    title: context.title || fileName,
    customer_id: context.customerId ?? null,
    quotation_id: context.quotationId ?? null,
    complaint_id: context.complaintId ?? null,
    job_id: context.jobId ?? null,
    created_by: user?.id ?? null,
  });
  if (docError) {
    console.error("uploadDocument (documents) failed", docError);
    return { error: "Could not record the file." };
  }

  for (const path of context.revalidate ?? ["/documents"]) {
    revalidatePath(path);
  }
  return { message: "File uploaded." };
}
