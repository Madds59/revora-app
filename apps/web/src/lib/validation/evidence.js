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
