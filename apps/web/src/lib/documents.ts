import "server-only";

import { createClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage";
import type { EvidenceItem } from "@/lib/evidence";

type DocRow = {
  id: string;
  title: string;
  created_at: string;
  media: { object_path: string; file_name: string; mime_type: string } | null;
};

/** Documents attached to a job, as gallery items with signed URLs (RLS-scoped). */
export async function loadJobAttachments(jobId: string): Promise<EvidenceItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select(
      "id, title, created_at, media:media_assets(object_path, file_name, mime_type)",
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
        url: row.media ? await signedUrl(row.media.object_path) : null,
        isImage: mime.startsWith("image/"),
        createdAt: row.created_at,
      };
    }),
  );
}
