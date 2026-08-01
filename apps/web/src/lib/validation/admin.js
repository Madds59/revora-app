// Platform-administration mutation validation (APPSEC-09 admin phase).
//
// WHY THIS EXISTS
// The /admin area is the product's only *global* authority surface: a verified
// platform administrator acts across every tenant, unscoped by business
// membership. Authorization itself is already sound and is deliberately NOT
// re-implemented here — `requireSuperAdmin()` (lib/auth.ts) resolves the actor
// from the server session and checks the canonical `platform_admins` table, and
// every `admin_*` RPC is SECURITY DEFINER and re-checks `is_super_admin()` on
// its own. Neither trusts a caller-supplied role, `account_intent`, profile
// display role, or any client field.
//
// What was missing is the OTHER half of the standard: the admin actions passed
// caller-controlled form values straight through to those privileged RPCs with
// no strict parsing. Global authority does not make a malformed or ambiguous
// instruction safe — an administrator is still an external input source. In
// particular the super-admin grant/revoke direction came from a hidden form
// field compared loosely against the string "true", so an absent field silently
// meant GRANT.
//
// Every schema here therefore fails closed toward "no privilege change".

import { z } from "zod";

import { firstValidationMessage, uuid } from "./common.js";

export { firstValidationMessage };

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The privilege-change direction must be stated EXPLICITLY. A missing, empty or
 * unrecognised value is rejected rather than defaulted — the previous
 * `String(value ?? "true") === "true"` form granted platform administration
 * when the field was absent and revoked it for any other string.
 */
export const adminIntent = z.enum(["true", "false"], {
  message: "Choose whether to grant or revoke platform administration.",
});

/**
 * Grant/revoke platform administration.
 *
 * The email selects an EXISTING auth user inside the SECURITY DEFINER RPC; it
 * is never itself authority, and this schema only proves shape. Case is
 * preserved (the RPC lowercases both sides when matching) and the trimmed value
 * is what the caller-visible confirmation echoes back, so an unbounded or
 * control-character-bearing string cannot be reflected into the admin UI.
 */
export const setSuperAdminSchema = z.object({
  email: z
    .string({ message: "Enter the user's email address." })
    .trim()
    .min(1, "Enter the user's email address.")
    .max(320, "Please enter a valid email address.")
    .refine((v) => !CONTROL_CHARS_RE.test(v), "Please enter a valid email address.")
    .refine((v) => EMAIL_RE.test(v), "Please enter a valid email address."),
  makeAdmin: adminIntent.transform((v) => v === "true"),
});

/** Mark one platform notification read. The id must be a real UUID. */
export const adminMarkNotificationReadSchema = z.object({
  notificationId: uuid("notification"),
});

// --- admin list pagination ---------------------------------------------------

/**
 * Bound page size before it reaches an `admin_*_filtered` RPC. The RPCs already
 * clamp with `greatest(1, least(coalesce(p_limit, 50), 100))`, so this is
 * defence in depth and keeps the app's own page-count arithmetic sane: the
 * previous `Number(raw) || 25` accepted 1e9 and negative values, which produced
 * a negative offset and a nonsensical page count.
 */
export const ADMIN_MAX_PAGE_SIZE = 100;
export const ADMIN_DEFAULT_PAGE_SIZE = 25;

export function parseAdminPageSize(value, fallback = ADMIN_DEFAULT_PAGE_SIZE) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  if (floored < 1) return fallback;
  return Math.min(floored, ADMIN_MAX_PAGE_SIZE);
}

// --- privileged call-site registry ------------------------------------------

/**
 * Explicit registry of every platform-administration MUTATION and the guard it
 * must call first. An explicit list is used rather than a repo-wide regex
 * because a regex over "admin" would go green by accident; this fails loudly
 * when a new admin mutation is added without a guard.
 *
 * Reads are covered separately: all `admin_list_*` / `admin_platform_metrics`
 * RPCs are SECURITY DEFINER and re-check `is_super_admin()` themselves.
 */
export const ADMIN_MUTATION_REGISTRY = [
  {
    action: "setSuperAdmin",
    file: "src/app/[locale]/(admin)/admin/actions.ts",
    guard: "requireSuperAdmin",
    rpc: "admin_set_super_admin",
    schema: "setSuperAdminSchema",
    destructive: true,
  },
  {
    action: "markNotificationRead",
    file: "src/app/[locale]/(admin)/admin/actions.ts",
    guard: "requireSuperAdmin",
    rpc: "admin_mark_notification_read",
    schema: "adminMarkNotificationReadSchema",
    destructive: false,
  },
];

/** RPCs the admin surface may call. Nothing else is reachable from /admin. */
export const ADMIN_MUTATION_RPCS = ADMIN_MUTATION_REGISTRY.map((entry) => entry.rpc);
