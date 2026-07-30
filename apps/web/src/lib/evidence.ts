import "server-only";

import { createClient } from "@/lib/supabase/server";
import { signOwnedStorageObject } from "@/lib/storage";
import { COMPLAINT_EVIDENCE_ENTITY } from "@/lib/validation/evidence";

export type EvidenceItem = {
  id: string;
  description: string | null;
  fileName: string;
  mimeType: string;
  url: string | null;
  isImage: boolean;
  createdAt: string;
};

type EvidenceRow = {
  id: string;
  description: string | null;
  created_at: string;
  business_id: string;
  complaint_id: string;
  media: {
    object_path: string;
    file_name: string;
    mime_type: string;
  } | null;
};

/**
 * Loads a complaint's evidence (RLS-scoped to the caller) and signs a
 * short-lived URL for each file. Works for both staff and the linked customer.
 *
 * Signing goes through `signOwnedStorageObject`, which re-proves that each
 * STORED path belongs to the row's own business and complaint before the
 * service role is used. Row visibility alone is not authorization: a row
 * written before APPSEC-09 Phase 4A could point at another tenant's object.
 * `actor` decides how unbound legacy paths are treated — staff may still view
 * them (their access is business-wide), portal customers fail closed.
 */
export async function loadComplaintEvidence(
  complaintId: string,
  actor: "staff" | "customer",
): Promise<EvidenceItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("complaint_evidence")
    .select(
      "id, description, created_at, business_id, complaint_id, media:media_assets(object_path, file_name, mime_type)",
    )
    .eq("complaint_id", complaintId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as EvidenceRow[];
  return Promise.all(
    rows.map(async (row) => {
      const mime = row.media?.mime_type ?? "";
      return {
        id: row.id,
        description: row.description,
        fileName: row.media?.file_name ?? "file",
        mimeType: mime,
        url: row.media
          ? await signOwnedStorageObject(row.media.object_path, {
              // Authorization inputs come from the evidence row itself, which
              // the RPC wrote from server-verified values.
              businessId: row.business_id,
              namespace: COMPLAINT_EVIDENCE_ENTITY,
              resourceId: row.complaint_id,
              actor,
            })
          : null,
        isImage: mime.startsWith("image/"),
        createdAt: row.created_at,
      };
    }),
  );
}
