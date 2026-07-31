// Vehicle-media upload validation and Storage-path ownership (APPSEC-09 Phase 4B).
//
// FINDINGS THIS CLOSES (uploadVehicleMediaAction)
//   * `storage_bucket` was taken from the client and persisted verbatim.
//   * `storage_path` was taken from the client and persisted verbatim.
//   * `vehicle_id` was a client selector written without ownership verification,
//     so a member of business A could record media against business B's vehicle.
//   * `customer_id` was a client selector written without checking it matched
//     the vehicle's real customer.
//
// SEVERITY, VERIFIED RATHER THAN ASSUMED
// Every reader of `vehicle_media_uploads` was traced (dashboard and portal
// vehicle detail pages). Both render `storage_path` as escaped JSX text; there
// is **no** service-role client, signed-URL generator, Storage download/remove,
// AI provider call, or active URL consuming these columns today. So this is a
// write-boundary fix — but an unvalidated path persisted now becomes a
// privileged-boundary problem the moment any reader starts signing it, which is
// exactly how the evidence issue in Phase 4A arose. The stored values are
// therefore canonicalised at write time, and a release-gate test asserts no
// privileged reader appears without a guard.
//
// PATH GRAMMAR (from components/vehicle-media-upload.tsx, which passes
// `entity="vehicles/<vehicleId>/media"` into the shared uploader):
//
//   <business-id>/vehicles/<vehicle-id>/media/<object-name>     five segments
//
// The Storage policies authorize on `split_part(name, '/', 1)` only, so this
// deeper grammar needs no policy or migration change.

import { z } from "zod";
import { optionalText, requiredText, uuid } from "./common.js";

/** The only bucket vehicle media may live in (server-selected, never client). */
export const VEHICLE_MEDIA_BUCKET = "revora-private";

/** Fixed path segments around the vehicle id. */
export const VEHICLE_MEDIA_ROOT = "vehicles";
export const VEHICLE_MEDIA_LEAF = "media";

/** Mirrors the `vehicle_media_uploads_media_type_check` constraint. */
export const VEHICLE_MEDIA_TYPES = ["image", "video", "document", "audio", "other"];

const OBJECT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME_RE = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;

/**
 * Prove a vehicle-media object path belongs to the given business AND vehicle.
 *
 * Both ids must already be server-verified (business from the session, vehicle
 * from a row loaded under that business). Comparison is exact segment equality —
 * never `startsWith` — so `<business-id>-evil/...` cannot pass. Returns the
 * verified components so callers rebuild the canonical path instead of reusing
 * the raw client string, or `null` when ownership cannot be proven.
 */
export function parseOwnedVehicleMediaPath(objectPath, { businessId, vehicleId }) {
  if (typeof objectPath !== "string") return null;
  if (typeof businessId !== "string" || !UUID_RE.test(businessId)) return null;
  if (typeof vehicleId !== "string" || !UUID_RE.test(vehicleId)) return null;

  if (objectPath.length === 0 || objectPath.length > 400) return null;
  if (CONTROL_CHARS_RE.test(objectPath)) return null;
  if (objectPath.includes("\\")) return null;
  if (objectPath.startsWith("/") || objectPath.endsWith("/")) return null;

  const segments = objectPath.split("/");
  if (segments.length !== 5) return null;

  const [tenant, root, pathVehicleId, leaf, objectName] = segments;
  // Empty segments (from "//"), "." and ".." all fail these checks.
  if (tenant !== businessId) return null;
  if (root !== VEHICLE_MEDIA_ROOT) return null;
  if (pathVehicleId !== vehicleId) return null;
  if (leaf !== VEHICLE_MEDIA_LEAF) return null;
  if (!OBJECT_NAME_RE.test(objectName)) return null;

  return { businessId: tenant, vehicleId: pathVehicleId, objectName };
}

/** Rebuild the canonical path from already-verified components. */
export function buildVehicleMediaPath({ businessId, vehicleId, objectName }) {
  return `${businessId}/${VEHICLE_MEDIA_ROOT}/${vehicleId}/${VEHICLE_MEDIA_LEAF}/${objectName}`;
}

/**
 * Read/privileged-boundary guard. Vehicle media has no privileged reader today
 * (see the header note), so this exists so that any future signing/download
 * path has an approved helper to call — a stored row must never be treated as
 * an authorization decision.
 *
 * `storedBucket` must equal the server-approved bucket; a row claiming another
 * bucket is refused rather than followed.
 */
export function authorizeStoredVehicleMediaPath({
  storedPath,
  storedBucket,
  businessId,
  vehicleId,
}) {
  if (storedBucket !== VEHICLE_MEDIA_BUCKET) {
    return { allowed: false, code: "bucket_unapproved" };
  }
  const parsed = parseOwnedVehicleMediaPath(storedPath, { businessId, vehicleId });
  if (!parsed) return { allowed: false, code: "path_unverified" };
  return {
    allowed: true,
    bucket: VEHICLE_MEDIA_BUCKET,
    objectPath: buildVehicleMediaPath(parsed),
  };
}

/**
 * Upload payload. `storage_bucket` is deliberately ABSENT: the client posts one
 * today, and it is ignored — the action always persists the server constant.
 * `customerId` is optional because `vehicle_media_uploads.customer_id` is
 * nullable and vehicles may legitimately have no linked customer; when present
 * it is only a selector, checked against the verified vehicle's real customer.
 *
 * Size/MIME follow the same evidence rules: a positive integer (zero-byte and
 * malformed rejected), no invented maximum, MIME shape-checked only with no
 * content inspection. No VIN decoding or specification enrichment occurs here.
 *
 * `fileName` is display/audit metadata only — it is never the Storage key (the
 * object name comes from the verified path) and `vehicle_media_uploads` has no
 * column for it, so it is validated and then used only in the tool-call record.
 */
export const vehicleMediaUploadSchema = z.object({
  vehicleId: uuid("vehicle"),
  customerId: z.preprocess(
    (v) =>
      v === null || v === undefined || (typeof v === "string" && v.trim() === "")
        ? undefined
        : v,
    uuid("customer").optional(),
  ),
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
  mediaType: z.preprocess(
    (v) =>
      v === undefined || v === null || String(v).trim() === "" ? "other" : v,
    z
      .any()
      .refine(
        (v) => typeof v === "string" && VEHICLE_MEDIA_TYPES.includes(v),
        "Please choose a valid media type.",
      ),
  ),
  description: optionalText(2000),
});
