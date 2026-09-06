// Business-settings, invitation and branding input schemas (APPSEC-09 Phase 3).
//
// Evidence-based boundaries:
//   * `businesses.country` and `businesses.default_language` are FREE-TEXT
//     inputs in the settings form and plain `text` columns with defaults
//     ('AE' / 'en') and no CHECK constraint. They are therefore validated as
//     bounded text with the existing defaults preserved — imposing a
//     currency/locale allowlist here would reject values the product accepts
//     today. `customers.preferred_language`, by contrast, IS a two-option
//     Select and is allowlisted (see customers.js).
//   * Invitation ROLES are strictly allowlisted from the existing
//     INVITABLE_ROLES set; `super_admin`, `business_owner` and `customer` are
//     rejected even though they exist in the member_role enum.
//   * Invitation EXPIRY (APPSEC-10) is deliberately out of scope: no
//     expires_at, no expiry enforcement, no schema change.
//
// business_id / invited_by are never part of these schemas — both come from the
// authenticated membership in the action.

import { z } from "zod";
import {
  numberField,
  optionalEmail,
  optionalPhone,
  optionalText,
  requiredText,
  uuid,
} from "./common.js";

/** Roles an owner may invite today (mirrors invite-actions.ts INVITABLE_ROLES). */
export const INVITABLE_ROLES = ["manager", "employee"];

/** Text with the column's existing default when submitted blank. */
const textWithDefault = (def, max, label) =>
  z.preprocess(
    (v) => (v === undefined || v === null || String(v).trim() === "" ? def : v),
    z.string().trim().min(1).max(max, `${label} is too long.`),
  );

/** updateBusiness: profile fields on the authenticated business. */
export const updateBusinessSchema = z.object({
  name: requiredText("Business name", 200),
  legalName: optionalText(200),
  tagline: optionalText(300),
  country: textWithDefault("AE", 60, "Country"),
  defaultLanguage: textWithDefault("en", 20, "Default language"),
  // UAE Tax Registration Number, required by issue_invoice() before an
  // invoice can be issued. See 0034_invoicing_and_appointments.sql.
  trn: z.preprocess(
    (v) => (v === undefined || v === null || String(v).trim() === "" ? undefined : v),
    z
      .string()
      .trim()
      .regex(/^[0-9]{15}$/, "TRN must be exactly 15 digits.")
      .optional(),
  ),
});

/** addBranch: a branch belonging to the authenticated business. */
export const addBranchSchema = z.object({
  name: requiredText("Branch name", 200),
  phone: optionalPhone(),
  email: optionalEmail(),
});

/**
 * addService. `default_price` is nullable `numeric(12,2)`: blank stays blank
 * (persisted as null, preserving current behavior) and a non-blank value must
 * be a real number within the column's precision — matching the money rule the
 * quotation schemas already use.
 */
export const optionalMoney = (label = "amount") =>
  z.preprocess(
    (v) =>
      v === undefined || v === null || String(v).trim() === "" ? undefined : v,
    numberField({ label, def: 0, min: 0, max: 9_999_999.99 }).optional(),
  );

export const addServiceSchema = z.object({
  name: requiredText("Service name", 200),
  description: optionalText(2000),
  defaultPrice: optionalMoney("default price"),
});

/**
 * inviteTeammate. Email is lowercased (the action already did this, and the
 * pending-invite unique index depends on it). Role must be in the invitable
 * allowlist. Business + inviter identity come from the session.
 */
export const inviteTeammateSchema = z.object({
  email: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
    requiredText("Email", 320).regex(
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      "Please enter a valid email.",
    ),
  ),
  role: z.preprocess(
    (v) => (v === undefined || v === null ? "" : v),
    z
      .any()
      .refine(
        (v) => typeof v === "string" && INVITABLE_ROLES.includes(v),
        "Choose a role (manager or service advisor).",
      ),
  ),
});

/** revokeInvitation: identifier only (tenant scope enforced in the action). */
export const revokeInvitationSchema = z.object({
  id: uuid("invitation"),
});

// --- branding / logo -------------------------------------------------------

/** Storage folder the logo uploader writes to (FileUpload `entity="branding"`). */
export const LOGO_ENTITY = "branding";

/**
 * Logo upload metadata recorded after the browser uploads to Storage.
 * `mimeType` mirrors the uploader's existing `accept="image/*"` constraint;
 * `sizeBytes` must be a real positive integer so zero-byte/garbage uploads are
 * rejected. No maximum is imposed because the product defines none today (see
 * INPUT_VALIDATION_STANDARD.md — recommended as a follow-up).
 */
export const businessLogoSchema = z.object({
  objectPath: requiredText("Upload", 400),
  fileName: optionalText(300),
  mimeType: z
    .string({ message: "Please upload an image file." })
    .trim()
    .max(150, "Please upload an image file.")
    .refine((v) => v.startsWith("image/"), "Please upload an image file."),
  sizeBytes: z.preprocess(
    (v) => (v === undefined || v === null || String(v).trim() === "" ? NaN : Number(String(v).trim())),
    z
      .number({ message: "That file could not be uploaded." })
      .refine(
        (n) => Number.isInteger(n) && n > 0,
        "That file could not be uploaded.",
      ),
  ),
});

/** One path segment produced by the uploader: `<uuid>-<slugified-name>`. */
const LOGO_FILE_RE = /^[a-z0-9][a-z0-9._-]{0,180}$/i;

/**
 * Verify a client-supplied Storage object path really sits inside the
 * authenticated business's branding namespace. The browser uploads directly to
 * Storage (constrained by the `revora_public_insert` policy), but the path it
 * then hands back is untrusted input: without this check an arbitrary or
 * cross-tenant path could be recorded as the business's logo. Traversal,
 * absolute paths, backslashes and extra segments are all rejected.
 */
export function isOwnedLogoPath(objectPath, businessId) {
  if (typeof objectPath !== "string" || typeof businessId !== "string") return false;
  if (objectPath.length === 0 || objectPath.length > 400) return false;
  if (objectPath.includes("\\") || objectPath.includes("..")) return false;
  if (objectPath.startsWith("/")) return false;

  const segments = objectPath.split("/");
  if (segments.length !== 3) return false;
  const [tenant, entity, file] = segments;
  return (
    tenant === businessId &&
    entity === LOGO_ENTITY &&
    LOGO_FILE_RE.test(file)
  );
}
