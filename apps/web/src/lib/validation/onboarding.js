// Onboarding / invitation validation (APPSEC-09 Phase 4E).
//
// WHY THIS EXISTS
// Onboarding is where a user first acquires tenant authority, so the trust
// model matters more here than the input volume suggests. The authority itself
// is already sound and is deliberately NOT re-implemented:
//
//   * `create_business` (migration 0004) is SECURITY DEFINER and derives the
//     owner from `auth.uid()`. The caller cannot name an owner; the business id
//     is generated server-side; the initial membership is inserted for that same
//     uid with the role hard-coded to 'business_owner'; and profile + business +
//     membership are created in one plpgsql body, so a failure cannot leave an
//     orphan business.
//   * `claim_business_invitations` (migration 0010) is SECURITY DEFINER and
//     takes **no arguments at all** — it matches pending invitations against the
//     *verified JWT email* of the caller, takes `business_id` and `role` from
//     the stored invitation row, and inserts membership with
//     `on conflict (business_id, user_id) do nothing`. A caller therefore cannot
//     accept someone else's invitation by learning its id, cannot substitute a
//     business, cannot upgrade the role, and cannot create a second membership.
//   * `inviteTeammate`/`revokeInvitation` were hardened in Phase 3: tenant and
//     inviter identity are session-derived and the role is allowlisted to
//     manager/employee (the DB `business_invitations_role_check` agrees).
//
// What was missing is the input half at the *app* boundary: the create-business
// action passed unbounded free text straight to the RPC, the intent action
// returned a raw Supabase auth error to the user, and — most importantly — the
// auth callback pasted a caller-controlled `next` parameter onto the origin,
// which is an open redirect.

import { z } from "zod";

import { firstValidationMessage, optionalText, requiredText } from "./common.js";

export { firstValidationMessage };

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;

/**
 * Mirrors `lib/account-intent.ts` ACCOUNT_INTENTS. Duplicated here (rather than
 * imported) because this module is also loaded by the offline `node --test`
 * suite, which cannot import the `.ts` file; a test asserts the two lists agree.
 *
 * account_intent is **UX routing state only**. It never grants tenant ownership,
 * staff membership, customer access or platform-admin authority — APPSEC-02
 * verified that no RLS policy, RPC or route guard consults it, and nothing here
 * changes that.
 */
export const ACCOUNT_INTENT_VALUES = ["business_owner", "customer", "staff_invited"];

export const onboardingIntentSchema = z.object({
  accountIntent: z.enum(ACCOUNT_INTENT_VALUES, {
    message: "Choose an account type to continue.",
  }),
});

/**
 * Business creation. The 200-character cap matches the Phase 3
 * `updateBusiness` rule (`requiredText("Business name", 200)`) so a name cannot
 * be created that the settings form would refuse to edit.
 */
export const createBusinessSchema = z.object({
  name: requiredText("Business name", 200).refine(
    (v) => !CONTROL_CHARS_RE.test(v),
    "Business name contains unsupported characters.",
  ),
  fullName: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    optionalText(200)
      .refine(
        (v) => v === undefined || !CONTROL_CHARS_RE.test(v),
        "Your name contains unsupported characters.",
      )
      .optional(),
  ),
});

// --- redirect safety ---------------------------------------------------------

/**
 * Reduce a caller-supplied post-auth destination to a SAFE INTERNAL PATH.
 *
 * The auth callback previously did `redirect(`${origin}${next}`)` with `next`
 * straight from the query string. That is an open redirect: `next=@evil.example`
 * makes `https://<origin>@evil.example`, whose *host is evil.example* — the
 * origin becomes userinfo. A phishing link on the real Revora domain would send
 * the user to an attacker's site immediately after a genuine sign-in.
 *
 * Rules, in order: a string only; bounded; no control characters; must begin
 * with a single `/` (rejects `@host`, `https://host`, `javascript:`); not
 * protocol-relative (`//host`) and not `/\host`; and finally the value must
 * still resolve to the probe origin when parsed. Anything else falls back.
 */
export const MAX_REDIRECT_LENGTH = 512;
const PROBE_ORIGIN = "https://revora.invalid";

export function safeInternalRedirect(value, fallback = "/") {
  if (typeof value !== "string") return fallback;
  const raw = value.trim();
  if (raw.length === 0 || raw.length > MAX_REDIRECT_LENGTH) return fallback;
  if (CONTROL_CHARS_RE.test(raw)) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;

  try {
    const resolved = new URL(raw, PROBE_ORIGIN);
    if (resolved.origin !== PROBE_ORIGIN) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}

// --- onboarding privileged-boundary registry --------------------------------

/**
 * Explicit registry of the onboarding/invitation mutation boundaries and the
 * authority each one relies on. An explicit list (the Phase 4B/4D pattern) fails
 * loudly when a new onboarding mutation appears without a guard, where a
 * repo-wide regex would go green by accident.
 */
export const ONBOARDING_MUTATION_REGISTRY = [
  {
    action: "saveOnboardingIntent",
    file: "src/app/[locale]/(onboarding)/onboarding/actions.ts",
    authority: "getUser",
    target: "own profile row (id = session user id)",
    schema: "onboardingIntentSchema",
  },
  {
    action: "createBusiness",
    file: "src/app/[locale]/(onboarding)/onboarding/actions.ts",
    authority: "getUser",
    target: "create_business RPC (owner = auth.uid())",
    schema: "createBusinessSchema",
  },
  {
    action: "inviteTeammate",
    file: "src/app/[locale]/(dashboard)/settings/business/invite-actions.ts",
    authority: "requireMembership + canManageBusiness",
    target: "business_invitations (business_id session-derived)",
    schema: "inviteTeammateSchema",
  },
  {
    action: "revokeInvitation",
    file: "src/app/[locale]/(dashboard)/settings/business/invite-actions.ts",
    authority: "requireMembership + canManageBusiness",
    target: "business_invitations scoped by business_id + status",
    schema: "revokeInvitationSchema",
  },
  {
    action: "claimBusinessInvitations",
    file: "src/lib/auth.ts",
    authority: "getUser + SECURITY DEFINER RPC (verified JWT email)",
    target: "business_members (role/business from the invitation row)",
    schema: null,
  },
];
