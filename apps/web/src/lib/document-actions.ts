"use server";

import { revalidatePath } from "next/cache";

import { getUser, requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { firstValidationMessage } from "@/lib/validation/common";
import {
  buildResourceBoundPath,
  documentContextSchema,
  documentUploadSchema,
  parseNewResourceBoundPath,
  parseStoredEvidencePath,
} from "@/lib/validation/evidence";

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

// Same non-enumerating response for a missing or cross-tenant link target.
const TARGET_UNAVAILABLE = "Evidence target not found or unavailable.";

/** Tables a document may be linked to, keyed by the validated context field. */
const LINK_TABLES = {
  customerId: "customers",
  quotationId: "quotations",
  complaintId: "complaints",
  jobId: "jobs",
} as const;

/**
 * Records a staff-uploaded file as a media_asset + documents row. Staff can
 * insert both under RLS (media_assets_insert_members / documents_insert_staff),
 * so no SECURITY DEFINER is needed. Bind the context (links + type) at the call
 * site.
 *
 * The object path comes back from the browser after a direct-to-Storage upload,
 * so it is untrusted: private files are later signed with the service role
 * (`lib/storage.ts` `signedUrl()`, which bypasses Storage RLS), meaning a path
 * recorded against another tenant's namespace would yield a working signed URL.
 * The path is therefore pinned to the authenticated business and an allowed
 * document namespace, and every linked resource is ownership-checked, before
 * anything is written.
 */
export async function uploadDocument(
  context: DocumentContext,
  formData: FormData,
): Promise<UploadResult> {
  const { business } = await requireMembership();

  const parsed = documentUploadSchema.safeParse({
    objectPath: formData.get("object_path"),
    fileName: formData.get("file_name"),
    mimeType: formData.get("mime_type"),
    sizeBytes: formData.get("size_bytes"),
    documentType: context.documentType,
    title: context.title,
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const parsedContext = documentContextSchema.safeParse({
    customerId: context.customerId,
    quotationId: context.quotationId,
    complaintId: context.complaintId,
    jobId: context.jobId,
  });
  if (!parsedContext.success) return { error: TARGET_UNAVAILABLE };
  const links = parsedContext.data;

  const supabase = await createClient();

  // Every supplied link must belong to this business before it is persisted, so
  // a document cannot be attached to another tenant's record. This runs BEFORE
  // the path is bound, because the verified job id is what the path must match.
  for (const [field, table] of Object.entries(LINK_TABLES)) {
    const id = links[field as keyof typeof links];
    if (!id) continue;
    const { data: row, error: linkError } = await supabase
      .from(table)
      .select("id")
      .eq("id", id)
      .eq("business_id", business.id)
      .maybeSingle();
    if (linkError) {
      console.error("uploadDocument link lookup failed", linkError.code);
      return { error: "Could not record the file." };
    }
    if (!row) return { error: TARGET_UNAVAILABLE };
  }

  // A job photo has exactly one canonical owner (the job), so it must use the
  // resource-bound grammar. The standalone documents uploader has no single
  // owning resource, so those objects stay business-scoped — see
  // INPUT_VALIDATION_STANDARD.md for that documented residual.
  const namespace = links.jobId ? "job-photos" : "documents";
  const ownedPath = links.jobId
    ? parseNewResourceBoundPath(v.objectPath, {
        businessId: business.id,
        namespace,
        resourceId: links.jobId,
      })
    : parseStoredEvidencePath(v.objectPath, { businessId: business.id, namespace });
  if (!ownedPath) return { error: TARGET_UNAVAILABLE };

  const user = await getUser();
  const objectPath =
    ownedPath.version === 2
      ? buildResourceBoundPath(ownedPath)
      : `${ownedPath.businessId}/${ownedPath.namespace}/${ownedPath.objectName}`;

  const { data: media, error: mediaError } = await supabase
    .from("media_assets")
    .insert({
      business_id: business.id,
      bucket: "revora-private",
      object_path: objectPath,
      file_name: v.fileName,
      mime_type: v.mimeType,
      size_bytes: v.sizeBytes,
      purpose: v.documentType ?? "document",
      visibility: "private",
      uploaded_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (mediaError || !media) {
    if (mediaError)
      console.error("uploadDocument (media_assets) failed", mediaError.code);
    return { error: "Could not record the file." };
  }

  const { error: docError } = await supabase.from("documents").insert({
    business_id: business.id,
    media_asset_id: media.id,
    document_type: v.documentType ?? "file",
    title: v.title || v.fileName,
    customer_id: links.customerId ?? null,
    quotation_id: links.quotationId ?? null,
    complaint_id: links.complaintId ?? null,
    job_id: links.jobId ?? null,
    created_by: user?.id ?? null,
  });
  if (docError) {
    console.error("uploadDocument (documents) failed", docError.code);
    return { error: "Could not record the file." };
  }

  for (const path of context.revalidate ?? ["/documents"]) {
    revalidatePath(path);
  }
  return { message: "File uploaded." };
}
