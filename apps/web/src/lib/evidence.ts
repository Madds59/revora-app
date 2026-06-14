import "server-only";

import { createClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage";

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
  media: {
    object_path: string;
    file_name: string;
    mime_type: string;
  } | null;
};

/**
 * Loads a complaint's evidence (RLS-scoped to the caller) and signs a
 * short-lived URL for each file. Works for both staff and the linked customer.
 */
export async function loadComplaintEvidence(
  complaintId: string,
): Promise<EvidenceItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("complaint_evidence")
    .select(
      "id, description, created_at, media:media_assets(object_path, file_name, mime_type)",
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
        url: row.media ? await signedUrl(row.media.object_path) : null,
        isImage: mime.startsWith("image/"),
        createdAt: row.created_at,
      };
    }),
  );
}
