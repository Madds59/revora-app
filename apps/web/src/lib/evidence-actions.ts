"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type UploadResult = { error?: string; message?: string };

/**
 * Records a complaint-evidence file that was just uploaded to Storage. Bound to a
 * complaint id by the caller. The record_complaint_evidence RPC authorizes the
 * caller (business member or the complaint's customer) and writes the
 * media_assets + complaint_evidence rows.
 */
export async function recordComplaintEvidence(
  complaintId: string,
  formData: FormData,
): Promise<UploadResult> {
  const objectPath = String(formData.get("object_path") ?? "");
  const fileName = String(formData.get("file_name") ?? "");
  const mimeType = String(formData.get("mime_type") ?? "");
  const sizeBytes = Number(formData.get("size_bytes") ?? 0);
  if (!complaintId || !objectPath) return { error: "Missing upload details." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_complaint_evidence", {
    p_complaint_id: complaintId,
    p_object_path: objectPath,
    p_file_name: fileName,
    p_mime_type: mimeType,
    p_size_bytes: sizeBytes,
  });
  if (error) {
    console.error("recordComplaintEvidence failed", error);
    return { error: "Could not record the uploaded evidence." };
  }

  revalidatePath(`/portal/complaints/${complaintId}`);
  revalidatePath(`/complaints/${complaintId}`);
  return { message: "Evidence uploaded." };
}
