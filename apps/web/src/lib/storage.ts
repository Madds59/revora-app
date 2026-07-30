import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeStoredPathForSigning } from "@/lib/validation/evidence";

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
 * bypasses storage RLS.
 *
 * SECURITY: do not call this with a path that came out of the database. A stored
 * path is untrusted — the row being visible to the caller says nothing about
 * which object the path points at. Use `signOwnedStorageObject()`, which proves
 * the path belongs to the verified business/namespace/resource first.
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

/**
 * Authorize a STORED object path and only then sign it (APPSEC-09 Phase 4A).
 *
 * This is the read-time half of the evidence fix. Signing happens with the
 * service role, so Storage RLS cannot protect it: a row written before this
 * branch (or by any future unguarded path) could otherwise point at another
 * tenant's object and still be signed. Every field used to authorize must come
 * from a server-verified row, never from the request.
 *
 * Returns `null` when the path cannot be proven owned — the caller degrades to
 * "no link" rather than surfacing why, and the path itself is never logged.
 */
export async function signOwnedStorageObject(
  objectPath: string,
  context: {
    businessId: string;
    namespace: string;
    resourceId?: string | null;
    actor: "staff" | "customer";
    /**
     * Set only when the caller has independently proven the owning row belongs
     * to this customer (e.g. `documents.customer_id` is one of the session's
     * accounts). Required before a portal customer may be given a path that
     * carries no resource segment; the guard never infers ownership.
     */
    ownershipProven?: boolean;
  },
  expiresInSeconds = 3600,
): Promise<string | null> {
  const decision = authorizeStoredPathForSigning(objectPath, {
    businessId: context.businessId,
    namespace: context.namespace,
    resourceId: context.resourceId ?? undefined,
    actor: context.actor,
    ownershipProven: context.ownershipProven === true,
  });
  if (!decision.allowed || typeof decision.objectPath !== "string") {
    // Stable code only — never the path, filename, or provider detail.
    console.error("signOwnedStorageObject denied", decision.code ?? "path_unverified");
    return null;
  }
  // Only the canonical path rebuilt from verified components is ever signed.
  return signedUrl(decision.objectPath, expiresInSeconds);
}

/** Public URL for a brand asset in the public bucket. */
export function publicUrl(objectPath: string): string {
  const admin = createAdminClient();
  return admin.storage.from(PUBLIC_BUCKET).getPublicUrl(objectPath).data.publicUrl;
}
