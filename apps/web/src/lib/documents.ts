import "server-only";

import { createClient } from "@/lib/supabase/server";
import { signOwnedStorageObject } from "@/lib/storage";
import type { EvidenceItem } from "@/lib/evidence";

type DocRow = {
  id: string;
  title: string;
  created_at: string;
  business_id: string;
  job_id: string | null;
  media: { object_path: string; file_name: string; mime_type: string } | null;
};

/**
 * Documents attached to a job, as gallery items with signed URLs (RLS-scoped).
 *
 * Each stored path is re-proved against the document row's own business and job
 * before the service role signs it — see `signOwnedStorageObject`. Job photos
 * live in the resource-bound `job-photos` namespace, so a path belonging to a
 * different job in the same business is refused.
 */
export async function loadJobAttachments(
  jobId: string,
  actor: "staff" | "customer",
): Promise<EvidenceItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select(
      "id, title, created_at, business_id, job_id, media:media_assets(object_path, file_name, mime_type)",
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as DocRow[];
  return Promise.all(
    rows.map(async (row) => {
      const mime = row.media?.mime_type ?? "";
      return {
        id: row.id,
        description: row.title,
        fileName: row.media?.file_name ?? "file",
        mimeType: mime,
        url: row.media
          ? await signOwnedStorageObject(row.media.object_path, {
              businessId: row.business_id,
              namespace: "job-photos",
              resourceId: row.job_id,
              actor,
            })
          : null,
        isImage: mime.startsWith("image/"),
        createdAt: row.created_at,
      };
    }),
  );
}
