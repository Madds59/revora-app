"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireMembership } from "@/lib/auth";
import {
  canManageInspections,
  canManageQuotes,
  canShareInspections,
} from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { generateShareToken } from "@/lib/inspections/share";
import { firstValidationMessage } from "@/lib/validation/common";
import {
  buildResourceBoundPath,
  INSPECTION_ITEM_ENTITY,
  inspectionPhotoSchema,
  parseNewResourceBoundPath,
} from "@/lib/validation/evidence";
import {
  completeInspectionSchema,
  generateInspectionShareSchema,
  inspectionToQuotationSchema,
  removeInspectionPhotoSchema,
  revokeInspectionShareSchema,
  startInspectionSchema,
  updateInspectionItemSchema,
} from "@/lib/validation/inspections";
import { PRIVATE_BUCKET } from "@/lib/storage";

export type FormState = {
  error?: string;
  message?: string;
  /**
   * The plaintext share link, returned EXACTLY ONCE by generateInspectionShare
   * so the UI can show it for copying. It is never persisted, never re-fetched,
   * and never logged -- a second read requires rotating to a new token.
   */
  shareUrl?: string;
};

// One response for "no such inspection" and "belongs to another tenant", so the
// id space cannot be probed (matches the APPSEC-11 convention elsewhere).
const INSPECTION_UNAVAILABLE = "Inspection not found or unavailable.";

/**
 * Resolve an inspection inside the caller's own business.
 *
 * Every action below starts here: the client-supplied inspection id is never
 * passed to a write until a row with that id has been read back under the
 * caller's RLS and scoped by `business_id`.
 */
async function resolveInspection(businessId: string, inspectionId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vehicle_inspections")
    .select("id, status, business_id, quotation_id")
    .eq("business_id", businessId)
    .eq("id", inspectionId)
    .maybeSingle();
  return data;
}

export async function startInspection(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageInspections(member.role))
    return { error: "You don't have permission to start inspections." };

  const parsed = startInspectionSchema.safeParse({
    customerId: formData.get("customer_id"),
    vehicleId: formData.get("vehicle_id"),
    context: formData.get("context"),
    templateId: formData.get("template_id"),
    appointmentId: formData.get("appointment_id"),
    jobId: formData.get("job_id"),
    odometer: formData.get("odometer"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const supabase = await createClient();
  // The RPC's integrity trigger validates every anchor against the business,
  // but resolving the vehicle first turns a raw constraint violation into a
  // readable message for the common "wrong vehicle" mistake.
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("business_id", business.id)
    .eq("id", v.vehicleId)
    .eq("customer_id", v.customerId)
    .maybeSingle();
  if (!vehicle)
    return { error: "That vehicle does not belong to the selected customer." };

  const { data: inspectionId, error } = await supabase.rpc("create_inspection", {
    target_business_id: business.id,
    target_customer_id: v.customerId,
    target_vehicle_id: v.vehicleId,
    target_context: v.context,
    target_template_id: v.templateId ?? undefined,
    target_appointment_id: v.appointmentId ?? undefined,
    target_job_id: v.jobId ?? undefined,
    target_odometer: v.odometer ?? undefined,
  });
  if (error || !inspectionId) {
    // Ids only -- never note content or customer PII (spec section 16).
    console.error("startInspection failed", error?.code);
    return { error: "Could not start the inspection." };
  }

  revalidatePath("/inspections");
  redirect(`/inspections/${inspectionId}`);
}

/**
 * Persist one checklist card: its result and its note together.
 *
 * Writes go straight to `inspection_items` under RLS
 * (`inspection_items_manage_staff`); the `inspection_items_immutable` trigger
 * rejects the write outright once the parent inspection is completed, so a
 * stale tab cannot edit a report a customer has already been shown.
 */
export async function updateInspectionItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageInspections(member.role))
    return { error: "You don't have permission to edit this inspection." };

  const parsed = updateInspectionItemSchema.safeParse({
    inspectionId: formData.get("inspection_id"),
    itemId: formData.get("item_id"),
    result: formData.get("result"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const inspection = await resolveInspection(business.id, v.inspectionId);
  if (!inspection) return { error: INSPECTION_UNAVAILABLE };
  if (inspection.status !== "draft")
    return { error: "This inspection is completed and can no longer be edited." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("inspection_items")
    .update({ result: v.result, note: v.note ?? null })
    .eq("id", v.itemId)
    .eq("inspection_id", v.inspectionId)
    .eq("business_id", business.id);
  if (error) {
    console.error("updateInspectionItem failed", error.code);
    return { error: "Could not save that item." };
  }

  revalidatePath(`/inspections/${v.inspectionId}`);
  return { message: "Saved." };
}

export async function completeInspection(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageInspections(member.role))
    return { error: "You don't have permission to complete inspections." };

  const parsed = completeInspectionSchema.safeParse({
    inspectionId: formData.get("inspection_id"),
    summary: formData.get("summary"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const inspection = await resolveInspection(business.id, v.inspectionId);
  if (!inspection) return { error: INSPECTION_UNAVAILABLE };

  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_inspection", {
    target_inspection_id: v.inspectionId,
    target_summary: v.summary ?? undefined,
  });
  if (error) {
    console.error("completeInspection failed", error.code);
    return { error: "Could not complete the inspection." };
  }

  revalidatePath(`/inspections/${v.inspectionId}`);
  revalidatePath("/inspections");
  return { message: "Inspection completed." };
}

/**
 * Record a photo that the browser has just uploaded to Storage.
 *
 * Mirrors `recordComplaintEvidence`: the returned object path is untrusted, and
 * because reads are signed with the service role a path pointing at another
 * tenant would become a working URL. So the path is pinned to the verified
 * business, the `inspection-item` namespace AND the exact checklist item before
 * anything is written. `inspectionId`/`itemId` arrive as bound arguments so the
 * shared FileUpload component's `(formData) => …` signature still fits.
 */
export async function recordInspectionItemPhoto(
  inspectionId: string,
  itemId: string,
  formData: FormData,
): Promise<{ error?: string; message?: string }> {
  const { member, business } = await requireMembership();
  if (!canManageInspections(member.role))
    return { error: "You don't have permission to add photos." };

  const parsed = inspectionPhotoSchema.safeParse({
    inspectionId,
    itemId,
    objectPath: formData.get("object_path"),
    fileName: formData.get("file_name"),
    mimeType: formData.get("mime_type"),
    sizeBytes: formData.get("size_bytes"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const inspection = await resolveInspection(business.id, v.inspectionId);
  if (!inspection) return { error: INSPECTION_UNAVAILABLE };
  if (inspection.status !== "draft")
    return { error: "This inspection is completed and can no longer be edited." };

  const supabase = await createClient();
  // The item must belong to THIS inspection and business -- not merely exist.
  const { data: item } = await supabase
    .from("inspection_items")
    .select("id")
    .eq("id", v.itemId)
    .eq("inspection_id", v.inspectionId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!item) return { error: INSPECTION_UNAVAILABLE };

  const ownedPath = parseNewResourceBoundPath(v.objectPath, {
    businessId: business.id,
    namespace: INSPECTION_ITEM_ENTITY,
    resourceId: item.id,
  });
  if (!ownedPath) return { error: INSPECTION_UNAVAILABLE };

  const { data: asset, error: assetError } = await supabase
    .from("media_assets")
    .insert({
      business_id: business.id,
      bucket: PRIVATE_BUCKET,
      // Rebuilt from verified components, never the raw client string.
      object_path: buildResourceBoundPath(ownedPath),
      file_name: v.fileName,
      mime_type: v.mimeType,
      size_bytes: v.sizeBytes,
      purpose: "inspection_item",
      visibility: "private",
      uploaded_by: member.user_id,
    })
    .select("id")
    .single();
  if (assetError || !asset) {
    console.error("recordInspectionItemPhoto asset failed", assetError?.code);
    return { error: "Could not save that photo." };
  }

  const { error: linkError } = await supabase
    .from("inspection_item_media")
    .insert({
      business_id: business.id,
      inspection_item_id: item.id,
      media_asset_id: asset.id,
      created_by: member.user_id,
    });
  if (linkError) {
    console.error("recordInspectionItemPhoto link failed", linkError.code);
    return { error: "Could not attach that photo." };
  }

  revalidatePath(`/inspections/${v.inspectionId}`);
  return { message: "Photo added." };
}

export async function removeInspectionItemPhoto(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageInspections(member.role))
    return { error: "You don't have permission to remove photos." };

  const parsed = removeInspectionPhotoSchema.safeParse({
    inspectionId: formData.get("inspection_id"),
    itemId: formData.get("item_id"),
    mediaId: formData.get("media_id"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const inspection = await resolveInspection(business.id, v.inspectionId);
  if (!inspection) return { error: INSPECTION_UNAVAILABLE };
  if (inspection.status !== "draft")
    return { error: "This inspection is completed and can no longer be edited." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("inspection_item_media")
    .delete()
    .eq("id", v.mediaId)
    .eq("inspection_item_id", v.itemId)
    .eq("business_id", business.id);
  if (error) {
    console.error("removeInspectionItemPhoto failed", error.code);
    return { error: "Could not remove that photo." };
  }

  revalidatePath(`/inspections/${v.inspectionId}`);
  return { message: "Photo removed." };
}

/**
 * Turn selected findings into a DRAFT quotation.
 *
 * Prices are left at zero on purpose (spec section 11) -- a failed checkbox is
 * evidence, not an amount. The RPC re-filters to attention/fail, records
 * provenance on each line, and is idempotent per inspection.
 */
export async function createQuotationFromInspection(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageQuotes(member.role))
    return { error: "You don't have permission to create quotations." };

  const parsed = inspectionToQuotationSchema.safeParse({
    inspectionId: formData.get("inspection_id"),
    itemIds: formData.getAll("item_ids"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const inspection = await resolveInspection(business.id, v.inspectionId);
  if (!inspection) return { error: INSPECTION_UNAVAILABLE };
  if (inspection.status !== "completed")
    return { error: "Complete the inspection before quoting its findings." };

  const supabase = await createClient();
  const { data: quotationId, error } = await supabase.rpc(
    "create_quotation_from_inspection",
    { target_inspection_id: v.inspectionId, target_item_ids: v.itemIds },
  );
  if (error || !quotationId) {
    console.error("createQuotationFromInspection failed", error?.code);
    if (error?.message?.includes("quotable")) {
      return { error: "None of the selected items can be quoted." };
    }
    return { error: "Could not create the quotation." };
  }

  revalidatePath(`/inspections/${v.inspectionId}`);
  redirect(`/quotations/${quotationId}`);
}

/**
 * Mint (or rotate) the public share link for a completed inspection.
 *
 * Only the SHA-256 digest reaches the database. The plaintext link is returned
 * in `FormState.shareUrl` for a single render and is deliberately not stored,
 * not revalidated into any cache, and not logged. Rotating overwrites the hash,
 * which invalidates whatever link was issued before.
 */
export async function generateInspectionShare(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canShareInspections(member.role))
    return { error: "You don't have permission to share inspections." };

  const parsed = generateInspectionShareSchema.safeParse({
    inspectionId: formData.get("inspection_id"),
    expiresInDays: formData.get("expires_in_days"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const v = parsed.data;

  const inspection = await resolveInspection(business.id, v.inspectionId);
  if (!inspection) return { error: INSPECTION_UNAVAILABLE };
  if (inspection.status !== "completed")
    return { error: "Only a completed inspection can be shared." };

  const { token, tokenHashHex } = generateShareToken();
  const expiresAt = new Date(
    Date.now() + v.expiresInDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_inspection_share", {
    target_inspection_id: v.inspectionId,
    target_token_hash: tokenHashHex,
    target_expires_at: expiresAt,
  });
  if (error) {
    // The token must not appear in logs even on the failure path.
    console.error("generateInspectionShare failed", error.code);
    return { error: "Could not create the share link." };
  }

  revalidatePath(`/inspections/${v.inspectionId}`);
  // Relative path: the client joins it to its own origin, so no base URL is
  // guessed server-side and the token never enters a redirect or a log line.
  return { message: "Share link created.", shareUrl: `/i/${token}` };
}

export async function revokeInspectionShare(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canShareInspections(member.role))
    return { error: "You don't have permission to manage sharing." };

  const parsed = revokeInspectionShareSchema.safeParse({
    inspectionId: formData.get("inspection_id"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { inspectionId } = parsed.data;

  const inspection = await resolveInspection(business.id, inspectionId);
  if (!inspection) return { error: INSPECTION_UNAVAILABLE };

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_inspection_share", {
    target_inspection_id: inspectionId,
  });
  if (error) {
    console.error("revokeInspectionShare failed", error.code);
    return { error: "Could not revoke the share link." };
  }

  revalidatePath(`/inspections/${inspectionId}`);
  return { message: "Share link revoked." };
}
