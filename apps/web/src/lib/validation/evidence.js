// Evidence / attachment input + Storage-path schemas (APPSEC-09 Phase 4A).
//
// WHY THIS EXISTS
// Files are uploaded straight from the browser to Supabase Storage (constrained
// by the `revora_private_insert` policy, which pins the FIRST path segment to a
// business the caller belongs to). The browser then posts the resulting object
// path back to a server action, which records it in `media_assets`.
//
// That returned path is untrusted input, and it is NOT merely a defence-in-depth
// concern: private evidence is later read back through `lib/storage.ts`
// `signedUrl()`, which signs with the SERVICE ROLE and therefore bypasses
// Storage RLS entirely. A recorded path pointing at another tenant's namespace
// would be handed back as a working signed URL. So the path must be pinned to
// the authenticated/ownership-verified business before it is ever persisted.
//
// PATH GRAMMAR (from migration 0016 and components/file-upload.tsx):
//   <business_id>/<entity>/<uuid>-<safe-name>      — exactly three segments
// There is deliberately NO resource-id segment in the existing grammar, so a
// path cannot be cryptographically bound to one complaint/job. Adding one would
// change the upload architecture and invalidate stored paths, so Phase 4A pins
// the business + entity segments and enforces resource ownership separately in
// the action. See INPUT_VALIDATION_STANDARD.md for the residual.

import { z } from "zod";
import { optionalText, requiredText, uuid } from "./common.js";

/** Private-bucket namespaces the evidence/document actions may write to. */
export const COMPLAINT_EVIDENCE_ENTITY = "complaint-evidence";
export const DOCUMENT_ENTITIES = ["job-photos", "documents"];

/** One path segment as produced by the uploader: `<uuid>-<slugified-name>`. */
const OBJECT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;

/** Control characters (incl. NUL) must never appear in a Storage key. */
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse a client-supplied Storage object path and prove it belongs to the given
 * business and an allowed namespace.
 *
 * Returns the verified components `{ businessId, entity, objectName }` so
 * callers use parsed values instead of re-parsing the raw string, or `null` if
 * the path is not provably owned. Comparison is exact segment equality — never
 * `startsWith`/`includes`, so `<business-id>-evil/...` cannot pass.
 */
export function parseOwnedStoragePath(objectPath, { businessId, allowedEntities }) {
  if (typeof objectPath !== "string" || typeof businessId !== "string") return null;
  if (!UUID_RE.test(businessId)) return null;
  if (!Array.isArray(allowedEntities) || allowedEntities.length === 0) return null;

  if (objectPath.length === 0 || objectPath.length > 400) return null;
  if (CONTROL_CHARS_RE.test(objectPath)) return null;
  if (objectPath.includes("\\")) return null;
  if (objectPath.startsWith("/") || objectPath.endsWith("/")) return null;

  const segments = objectPath.split("/");
  if (segments.length !== 3) return null;

  const [tenant, entity, objectName] = segments;
  // Empty segments (from "//"), "." and ".." are all rejected by these checks.
  if (tenant !== businessId) return null;
  if (!allowedEntities.includes(entity)) return null;
  if (!OBJECT_NAME_RE.test(objectName)) return null;

  return { businessId: tenant, entity, objectName };
}

/** Convenience wrapper for the complaint-evidence namespace. */
export function parseOwnedComplaintEvidencePath(objectPath, businessId) {
  return parseOwnedStoragePath(objectPath, {
    businessId,
    allowedEntities: [COMPLAINT_EVIDENCE_ENTITY],
  });
}

/** Convenience wrapper for the document/job-photo namespaces. */
export function parseOwnedDocumentPath(objectPath, businessId) {
  return parseOwnedStoragePath(objectPath, {
    businessId,
    allowedEntities: DOCUMENT_ENTITIES,
  });
}

// --- v2: resource-bound paths ----------------------------------------------
//
// The three-segment grammar pins a path to a business but NOT to a resource, so
// one customer's object could be re-attached to another customer's complaint in
// the same business and then signed for them. v2 adds the verified parent
// resource id as a segment:
//
//   <business-id>/<namespace>/<resource-id>/<object-name>
//
// The Storage policies authorize on `split_part(name, '/', 1)` only, so the
// extra segment needs no policy or migration change.
//
// Namespaces that own exactly one parent resource require v2 for new writes.
// `documents` is deliberately NOT in this map: the standalone documents
// uploader has no canonical parent resource, so those objects stay
// business-scoped by design (see INPUT_VALIDATION_STANDARD.md).
export const RESOURCE_BOUND_NAMESPACES = {
  [COMPLAINT_EVIDENCE_ENTITY]: "complaint",
  "job-photos": "job",
};

/** Build the canonical v2 path from already-verified components. */
export function buildResourceBoundPath({ businessId, namespace, resourceId, objectName }) {
  return `${businessId}/${namespace}/${resourceId}/${objectName}`;
}

/**
 * Parse a stored or submitted path in either grammar and prove it belongs to
 * the given business, namespace and (for v2) parent resource.
 *
 * Returns `{ version: 1 | 2, businessId, namespace, resourceId, objectName }`
 * or `null`. Every comparison is exact equality against server-verified values;
 * the raw string is never authoritative and callers rebuild from components.
 *
 * `resourceId` is REQUIRED when validating a v2 path — a caller that cannot
 * supply a verified resource id cannot authorize a v2 object.
 */
export function parseStoredEvidencePath(
  objectPath,
  { businessId, namespace, resourceId = null },
) {
  if (typeof objectPath !== "string" || typeof businessId !== "string") return null;
  if (!UUID_RE.test(businessId)) return null;
  if (typeof namespace !== "string" || namespace.length === 0) return null;

  if (objectPath.length === 0 || objectPath.length > 400) return null;
  if (CONTROL_CHARS_RE.test(objectPath)) return null;
  if (objectPath.includes("\\")) return null;
  if (objectPath.startsWith("/") || objectPath.endsWith("/")) return null;

  const segments = objectPath.split("/");
  if (segments.length !== 3 && segments.length !== 4) return null;

  const tenant = segments[0];
  const ns = segments[1];
  if (tenant !== businessId) return null;
  if (ns !== namespace) return null;

  if (segments.length === 3) {
    const objectName = segments[2];
    if (!OBJECT_NAME_RE.test(objectName)) return null;
    return { version: 1, businessId: tenant, namespace: ns, resourceId: null, objectName };
  }

  const [, , pathResourceId, objectName] = segments;
  if (!UUID_RE.test(pathResourceId)) return null;
  if (!OBJECT_NAME_RE.test(objectName)) return null;
  // A v2 object may only be authorized against a verified resource id, and it
  // must match exactly — this is what blocks same-business cross-resource reuse.
  if (typeof resourceId !== "string" || !UUID_RE.test(resourceId)) return null;
  if (pathResourceId !== resourceId) return null;

  return {
    version: 2,
    businessId: tenant,
    namespace: ns,
    resourceId: pathResourceId,
    objectName,
  };
}

/**
 * Write-time check: new uploads into a resource-bound namespace MUST use v2.
 * Returns the verified components or `null`.
 */
export function parseNewResourceBoundPath(objectPath, { businessId, namespace, resourceId }) {
  const parsed = parseStoredEvidencePath(objectPath, { businessId, namespace, resourceId });
  if (!parsed) return null;
  if (parsed.version !== 2) return null;
  return parsed;
}

/**
 * Read-time authorization decision for a stored path, immediately before a
 * service-role signed URL would be generated.
 *
 * `actor` is `"staff"` (a verified member of the owning business) or
 * `"customer"` (a portal user). Legacy v1 objects in a resource-bound namespace
 * carry no proof of which resource/customer they belong to, so they **fail
 * closed for portal customers** and are permitted only for staff, whose access
 * is business-wide under the existing model. v2 objects are allowed for either
 * actor once business, namespace and resource all match exactly.
 *
 * Returns `{ allowed: true, objectPath }` with the canonical rebuilt path, or
 * `{ allowed: false, code }` with a stable, non-revealing code.
 */
export function authorizeStoredPathForSigning(objectPath, {
  businessId,
  namespace,
  resourceId,
  actor,
}) {
  const parsed = parseStoredEvidencePath(objectPath, { businessId, namespace, resourceId });
  if (!parsed) return { allowed: false, code: "path_unverified" };

  if (parsed.version === 1 && RESOURCE_BOUND_NAMESPACES[namespace]) {
    if (actor !== "staff") return { allowed: false, code: "legacy_unbound_customer" };
    return {
      allowed: true,
      objectPath: `${parsed.businessId}/${parsed.namespace}/${parsed.objectName}`,
      legacy: true,
    };
  }

  const rebuilt =
    parsed.version === 2
      ? buildResourceBoundPath(parsed)
      : `${parsed.businessId}/${parsed.namespace}/${parsed.objectName}`;
  return { allowed: true, objectPath: rebuilt, legacy: parsed.version === 1 };
}

/**
 * Upload metadata posted alongside the object path.
 *
 * `mimeType` is validated for SHAPE only: the product defines no evidence MIME
 * allowlist today (the complaint uploader accepts any image type, the documents
 * uploader accepts any type at all), so imposing one here would reject files
 * that upload fine today. File CONTENT is not inspected — a declared MIME is
 * never proof of what the bytes are. `sizeBytes` must be a positive integer
 * (zero-byte and
 * malformed uploads are rejected); no maximum is imposed because Revora has no
 * product-wide upload-size policy — that governance gap stays open.
 * `fileName` is display metadata only and is never used as the Storage key.
 */
const MIME_RE = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;

export const evidenceMetadataSchema = z.object({
  objectPath: requiredText("Upload", 400),
  fileName: z.preprocess(
    (v) => (v === undefined || v === null ? "" : v),
    z
      .string()
      .trim()
      .min(1, "That file could not be uploaded.")
      .max(300, "That file could not be uploaded.")
      .refine(
        (v) => !v.includes("/") && !v.includes("\\") && !CONTROL_CHARS_RE.test(v),
        "That file could not be uploaded.",
      ),
  ),
  mimeType: z
    .string({ message: "That file could not be uploaded." })
    .trim()
    .max(150, "That file could not be uploaded.")
    .regex(MIME_RE, "That file could not be uploaded."),
  sizeBytes: z.preprocess(
    (v) =>
      v === undefined || v === null || String(v).trim() === ""
        ? NaN
        : Number(String(v).trim()),
    z
      .number({ message: "That file could not be uploaded." })
      .refine(
        (n) => Number.isInteger(n) && n > 0,
        "That file could not be uploaded.",
      ),
  ),
});

/** recordComplaintEvidence: complaint selector + upload metadata. */
export const complaintEvidenceSchema = z.object({
  complaintId: uuid("complaint"),
  ...evidenceMetadataSchema.shape,
  description: optionalText(2000),
});

/** uploadDocument: upload metadata + the bound document context. */
export const documentUploadSchema = z.object({
  ...evidenceMetadataSchema.shape,
  documentType: optionalText(80),
  title: optionalText(300),
});

/**
 * Optional resource links on a document. These arrive as bound server-action
 * arguments rather than raw form fields, but they are still validated and each
 * present link is ownership-checked against the session business before insert.
 */
export const documentContextSchema = z.object({
  customerId: z.preprocess(nullToUndefined, uuid("customer").optional()),
  quotationId: z.preprocess(nullToUndefined, uuid("quotation").optional()),
  complaintId: z.preprocess(nullToUndefined, uuid("complaint").optional()),
  jobId: z.preprocess(nullToUndefined, uuid("job").optional()),
});

function nullToUndefined(v) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "")
    ? undefined
    : v;
}
