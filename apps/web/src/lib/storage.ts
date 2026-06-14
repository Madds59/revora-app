import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const PRIVATE_BUCKET = "revora-private";
export const PUBLIC_BUCKET = "revora-public";

/** Slugify a filename, keeping the extension. */
function safeName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const base = (dot === -1 ? fileName : fileName.slice(0, dot))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const ext = dot === -1 ? "" : fileName.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return `${base || "file"}${ext}`;
}

/** Canonical object path: <business_id>/<entity>/<uuid>-<name>. */
export function buildObjectPath(
  businessId: string,
  entity: string,
  fileName: string,
): string {
  return `${businessId}/${entity}/${crypto.randomUUID()}-${safeName(fileName)}`;
}

/**
 * Short-lived signed URL for a private object. Uses the service role and so
 * bypasses storage RLS — only call after the caller has been authorized for the
 * underlying record (e.g. the evidence row was returned under the user's RLS).
 */
export async function signedUrl(
  objectPath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from(PRIVATE_BUCKET)
    .createSignedUrl(objectPath, expiresInSeconds);
  return data?.signedUrl ?? null;
}

/** Public URL for a brand asset in the public bucket. */
export function publicUrl(objectPath: string): string {
  const admin = createAdminClient();
  return admin.storage.from(PUBLIC_BUCKET).getPublicUrl(objectPath).data.publicUrl;
}
