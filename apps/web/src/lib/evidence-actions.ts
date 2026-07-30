"use server";

import { revalidatePath } from "next/cache";

import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { firstValidationMessage } from "@/lib/validation/common";
import {
  buildResourceBoundPath,
  complaintEvidenceSchema,
  COMPLAINT_EVIDENCE_ENTITY,
  parseNewResourceBoundPath,
} from "@/lib/validation/evidence";

export type UploadResult = { error?: string; message?: string };

// Identical response for "no such complaint" and "belongs to another tenant" —
// a caller must not be able to probe for other businesses' complaints.
const TARGET_UNAVAILABLE = "Evidence target not found or unavailable.";

/**
 * Records a complaint-evidence file that was just uploaded to Storage.
 *
 * The `record_complaint_evidence` RPC is SECURITY DEFINER: it derives the
 * business from the complaint row and authorizes the caller as either a business
 * member or the complaint's customer. What it does NOT do is check that the
 * supplied `object_path` belongs to that business — and because private files
 * are later signed with the service role (`lib/storage.ts` `signedUrl()`, which
 * bypasses Storage RLS), a path pointing at another tenant's namespace would be
 * handed back as a working signed URL.
 *
 * So this action validates every value, re-resolves the complaint under the
 * caller's own RLS to obtain a trusted business id, and proves the path sits in
 * that business's `complaint-evidence` namespace before the RPC is invoked. The
 * RPC's own authorization remains the backstop.
 */
export async function recordComplaintEvidence(
  complaintId: string,
  formData: FormData,
): Promise<UploadResult> {
  const user = await getUser();
  if (!user) return { error: TARGET_UNAVAILABLE };

  const parsed = complaintEvidenceSchema.safeParse({
    complaintId,
    objectPath: formData.get("object_path"),
    fileName: formData.get("file_name"),
    mimeType: formData.get("mime_type"),
    sizeBytes: formData.get("size_bytes"),
    description: formData.get("description"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  // Ownership: the complaint must be readable by this caller under RLS
  // (`complaints_access` covers business members and the linked customer). The
  // business id comes from that verified row, never from the client.
  const supabase = await createClient();
  const { data: complaint, error: lookupError } = await supabase
    .from("complaints")
    .select("id, business_id")
    .eq("id", v.complaintId)
    .maybeSingle();
  if (lookupError) {
    console.error("recordComplaintEvidence lookup failed", lookupError.code);
    return { error: "Could not record the uploaded evidence." };
  }
  if (!complaint) return { error: TARGET_UNAVAILABLE };

  // Pin the path to the verified business, namespace AND complaint. New writes
  // must use the resource-bound (v2) grammar, so an object belonging to another
  // complaint — even inside the same business — cannot be attached here.
  const ownedPath = parseNewResourceBoundPath(v.objectPath, {
    businessId: complaint.business_id,
    namespace: COMPLAINT_EVIDENCE_ENTITY,
    resourceId: complaint.id,
  });
  if (!ownedPath) return { error: TARGET_UNAVAILABLE };

  const { error } = await supabase.rpc("record_complaint_evidence", {
    // Verified components only — never the raw client string.
    p_complaint_id: complaint.id,
    p_object_path: buildResourceBoundPath(ownedPath),
    p_file_name: v.fileName,
    p_mime_type: v.mimeType,
    p_size_bytes: v.sizeBytes,
    p_description: v.description ?? undefined,
  });
  if (error) {
    // Log the code only: paths and filenames may carry customer-supplied text.
    console.error("recordComplaintEvidence failed", error.code);
    return { error: "Could not record the uploaded evidence." };
  }

  revalidatePath(`/portal/complaints/${complaint.id}`);
  revalidatePath(`/complaints/${complaint.id}`);
  return { message: "Evidence uploaded." };
}
