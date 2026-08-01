import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// APPSEC-09 Phase 4E — onboarding, business creation and invitation security.
//
// Onboarding is where a user first acquires tenant authority. The authority
// model was found sound and is preserved: `create_business` and
// `claim_business_invitations` are SECURITY DEFINER and derive the actor from
// auth.uid()/the verified JWT email, never from caller input. The defects were
// on the input side — an unvalidated business name, a raw provider error
// returned to the user, and an OPEN REDIRECT in the auth callback.

import {
  ACCOUNT_INTENT_VALUES,
  createBusinessSchema,
  MAX_REDIRECT_LENGTH,
  ONBOARDING_MUTATION_REGISTRY,
  onboardingIntentSchema,
  safeInternalRedirect,
} from "../src/lib/validation/onboarding.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(path.join(here, "..", "src", p), "utf8");
const repo = (p) => readFileSync(path.join(here, "..", "..", "..", p), "utf8");

const ONBOARDING_ACTIONS = "app/[locale]/(onboarding)/onboarding/actions.ts";
const INVITE_ACTIONS = "app/[locale]/(dashboard)/settings/business/invite-actions.ts";
const CALLBACK = "app/auth/callback/route.ts";

const actions = src(ONBOARDING_ACTIONS);
const invites = src(INVITE_ACTIONS);
const callback = src(CALLBACK);
const auth = src("lib/auth.ts");
const ok = (r) => r.success === true;

// --- redirect safety (the open redirect) ------------------------------------

test("redirect: the userinfo trick that made this an open redirect is blocked", () => {
  // `https://<origin>@evil.example` parses with host evil.example.
  assert.equal(safeInternalRedirect("@evil.example"), "/");
  const origin = "https://revora-app.vercel.app";
  const resolved = new URL(`${origin}${safeInternalRedirect("@evil.example")}`);
  assert.equal(resolved.host, "revora-app.vercel.app");
});

test("redirect: absolute, protocol-relative and scheme payloads are refused", () => {
  for (const bad of [
    "https://evil.example",
    "http://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "data:text/html,<script>",
    "mailto:someone@example.com",
    "evil.example",
    "\\\\evil.example",
  ]) {
    assert.equal(safeInternalRedirect(bad), "/", `${bad} must not survive`);
  }
});

test("redirect: every refusal keeps the browser on the real origin", () => {
  const origin = "https://revora-app.vercel.app";
  for (const bad of ["@evil.example", "https://evil.example", "//evil.example", "/\\evil.example"]) {
    const host = new URL(`${origin}${safeInternalRedirect(bad)}`).host;
    assert.equal(host, "revora-app.vercel.app", `${bad} escaped the origin`);
  }
});

test("redirect: legitimate internal destinations still work", () => {
  assert.equal(safeInternalRedirect("/"), "/");
  assert.equal(safeInternalRedirect("/portal"), "/portal");
  assert.equal(safeInternalRedirect("/en/quotations?page=2"), "/en/quotations?page=2");
  assert.equal(safeInternalRedirect("/ar/settings/business#team"), "/ar/settings/business#team");
});

test("redirect: non-strings, blanks, control characters and overlong values fall back", () => {
  for (const bad of [null, undefined, 42, {}, [], true, "", "   "]) {
    assert.equal(safeInternalRedirect(bad), "/");
  }
  assert.equal(safeInternalRedirect(`/x${String.fromCharCode(10)}/y`), "/");
  assert.equal(safeInternalRedirect(`/${"a".repeat(MAX_REDIRECT_LENGTH + 1)}`), "/");
});

test("redirect: a caller-supplied fallback is honoured but never trusted blindly", () => {
  assert.equal(safeInternalRedirect("@evil.example", "/login"), "/login");
});

test("callback: the route reduces `next` before appending it to the origin", () => {
  assert.match(callback, /safeInternalRedirect\(searchParams\.get\("next"\)\)/);
  // The raw parameter must never reach the redirect again.
  assert.ok(
    !/\$\{origin\}\$\{searchParams\.get\("next"\)/.test(callback),
    "raw next must not be concatenated onto the origin",
  );
  assert.match(callback, /NextResponse\.redirect\(`\$\{origin\}\$\{next\}`\)/);
});

// --- onboarding intent -------------------------------------------------------

test("intent: only the repository's three account intents are accepted", () => {
  for (const value of ACCOUNT_INTENT_VALUES) {
    assert.ok(ok(onboardingIntentSchema.safeParse({ accountIntent: value })), value);
  }
  for (const bad of ["super_admin", "platform_admin", "owner", "admin", "", null, undefined, 1, {}]) {
    assert.ok(!ok(onboardingIntentSchema.safeParse({ accountIntent: bad })));
  }
});

test("intent: the mirrored allowlist matches lib/account-intent.ts exactly", () => {
  const ts = src("lib/account-intent.ts");
  const declared = [...ts.matchAll(/"(business_owner|customer|staff_invited)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(declared)].sort(), [...ACCOUNT_INTENT_VALUES].sort());
});

test("intent: account_intent confers no authority anywhere in the guards", () => {
  // APPSEC-02's invariant, re-asserted: intent only routes.
  const guard = auth.slice(auth.indexOf("export const isSuperAdmin"), auth.indexOf("export async function requireUser"));
  assert.ok(!guard.includes("account_intent"));
  assert.ok(!repo("supabase/migrations/0002_rls_policies.sql").includes("account_intent"));
  assert.ok(!repo("supabase/migrations/0009_platform_admins.sql").includes("account_intent"));
});

// --- business creation -------------------------------------------------------

test("business: name is required, trimmed and bounded to the settings-form limit", () => {
  assert.ok(!ok(createBusinessSchema.safeParse({ name: "" })));
  assert.ok(!ok(createBusinessSchema.safeParse({ name: "   " })));
  assert.ok(!ok(createBusinessSchema.safeParse({ name: "a".repeat(201) })));
  const parsed = createBusinessSchema.safeParse({ name: "  Revora Garage  " });
  assert.ok(ok(parsed));
  assert.equal(parsed.data.name, "Revora Garage");
});

test("business: control characters are rejected in name and owner name", () => {
  const nl = String.fromCharCode(10);
  assert.ok(!ok(createBusinessSchema.safeParse({ name: `Garage${nl}Co` })));
  assert.ok(!ok(createBusinessSchema.safeParse({ name: "Garage", fullName: `A${nl}B` })));
});

test("business: Arabic names survive verbatim", () => {
  const parsed = createBusinessSchema.safeParse({ name: "ورشة ريفورا", fullName: "محمد بن راشد" });
  assert.ok(ok(parsed));
  assert.equal(parsed.data.name, "ورشة ريفورا");
});

test("business: owner name is optional and blank collapses to undefined", () => {
  const blank = createBusinessSchema.safeParse({ name: "Garage", fullName: "   " });
  assert.ok(ok(blank));
  assert.equal(blank.data.fullName, undefined);
});

test("business: caller-supplied owner/business/role fields cannot ride along", () => {
  const parsed = createBusinessSchema.safeParse({
    name: "Garage",
    owner_id: "11111111-1111-4111-8111-111111111111",
    business_id: "22222222-2222-4222-8222-222222222222",
    role: "super_admin",
    created_by: "33333333-3333-4333-8333-333333333333",
  });
  assert.ok(ok(parsed));
  for (const forbidden of ["owner_id", "business_id", "role", "created_by"]) {
    assert.ok(!(forbidden in parsed.data), `${forbidden} must be stripped`);
  }
  // Only the two declared fields can ever survive (fullName is omitted here).
  for (const key of Object.keys(parsed.data)) {
    assert.ok(["name", "fullName"].includes(key), `unexpected key ${key}`);
  }
});

test("business: the action validates, then calls the RPC with no owner identity", () => {
  const fn = actions.slice(actions.indexOf("export async function createBusiness"));
  const parseAt = fn.indexOf("createBusinessSchema.safeParse");
  const rpcAt = fn.indexOf('rpc("create_business"');
  assert.ok(parseAt > -1 && rpcAt > parseAt, "must validate before the RPC");
  const call = fn.slice(rpcAt, rpcAt + 260);
  assert.match(call, /business_name: parsed\.data\.name/);
  for (const forbidden of ["owner_id", "user_id", "auth.uid", "created_by", "role:"]) {
    assert.ok(!call.includes(forbidden), `owner identity must not be sent (${forbidden})`);
  }
});

test("business: unauthenticated callers never reach the RPC", () => {
  const fn = actions.slice(actions.indexOf("export async function createBusiness"));
  const authAt = fn.indexOf("await getUser()");
  const rpcAt = fn.indexOf('rpc("create_business"');
  assert.ok(authAt > -1 && authAt < rpcAt);
  assert.match(fn.slice(authAt, authAt + 120), /if \(!user\) redirect\("\/login"\)/);
});

test("business: a repeat submission cannot create a second business", () => {
  const fn = actions.slice(actions.indexOf("export async function createBusiness"));
  const guardAt = fn.indexOf("getCurrentMembership()");
  const rpcAt = fn.indexOf('rpc("create_business"');
  assert.ok(guardAt > -1, "an existing-membership guard must exist");
  assert.ok(guardAt < rpcAt, "the guard must run before creation");
  assert.match(fn.slice(guardAt, guardAt + 140), /if \(existingMembership\) redirect/);
});

test("business: the create RPC derives the owner and role server-side", () => {
  const sql = repo("supabase/migrations/0004_onboarding_rpc.sql");
  const body = sql.slice(sql.indexOf("create or replace function public.create_business"));
  assert.match(body, /uid uuid := auth\.uid\(\)/);
  assert.match(body, /if uid is null then[\s\S]{0,120}not authenticated/);
  assert.match(body, /insert into public\.business_members \(business_id, user_id, role\)[\s\S]{0,120}'business_owner'/);
  // No caller-supplied owner parameter exists at all.
  assert.ok(!/create or replace function public\.create_business\([^)]*owner_id/.test(sql));
});

// --- invitation creation -----------------------------------------------------

test("invitations: creation requires a manage-capable member of the session business", () => {
  const fn = invites.slice(invites.indexOf("export async function inviteTeammate"));
  const authAt = fn.indexOf("requireMembership()");
  const roleAt = fn.indexOf("canManageBusiness(member.role)");
  const insertAt = fn.indexOf(".insert(");
  assert.ok(authAt > -1 && roleAt > authAt && insertAt > roleAt);
  assert.match(fn, /business_id: business\.id/);
  assert.match(fn, /invited_by: user\?\.id/);
});

test("invitations: tenant and inviter identity are never caller-supplied", () => {
  const fn = invites.slice(invites.indexOf("export async function inviteTeammate"));
  const call = fn.slice(fn.indexOf(".insert("), fn.indexOf(".insert(") + 320);
  for (const forbidden of ['formData.get("business_id")', 'formData.get("invited_by")', "...parsed.data", "Object.fromEntries"]) {
    assert.ok(!call.includes(forbidden), `caller must not supply ${forbidden}`);
  }
});

test("invitations: role is allowlisted in the app and again in the database", () => {
  const settings = src("lib/validation/business-settings.js");
  assert.match(settings, /manager/);
  assert.match(settings, /employee/);
  const sql = repo("supabase/migrations/0010_team_invitations.sql");
  assert.match(sql, /business_invitations_role_check[\s\S]{0,80}check \(role in \('manager', 'employee'\)\)/);
  // The RLS policy pins the role too, so escalation is refused a layer earlier
  // than the check constraint (runtime QA case ONB-10 observes exactly this).
  assert.match(
    sql,
    /policy "business_invitations_manage_owner"[\s\S]{0,320}with check \([\s\S]{0,200}role in \('manager', 'employee'\)/,
  );
  // Platform administration is a separate table and cannot be granted here.
  assert.ok(!sql.includes("platform_admins"));
});

test("invitations: revocation is scoped by business and pending status", () => {
  const fn = invites.slice(invites.indexOf("export async function revokeInvitation"));
  assert.match(fn, /\.eq\("business_id", business\.id\)/);
  assert.match(fn, /\.eq\("status", "pending"\)/);
});

test("invitations: no token column exists, so none can be logged or leaked", () => {
  const sql = repo("supabase/migrations/0010_team_invitations.sql");
  const table = sql.slice(sql.indexOf("create table public.business_invitations"), sql.indexOf(");"));
  assert.ok(!/token/i.test(table), "acceptance is by verified email, not a bearer token");
  assert.ok(!invites.toLowerCase().includes("token"));
});

// --- invitation acceptance ---------------------------------------------------

test("acceptance: the RPC takes no arguments — nothing to substitute", () => {
  const sql = repo("supabase/migrations/0010_team_invitations.sql");
  assert.match(sql, /create or replace function public\.claim_business_invitations\(\)/);
  assert.match(auth, /rpc\("claim_business_invitations"\)/);
});

test("acceptance: actor and email come from the session, not the request", () => {
  const sql = repo("supabase/migrations/0010_team_invitations.sql");
  const body = sql.slice(sql.indexOf("create or replace function public.claim_business_invitations"));
  assert.match(body, /uid uuid := auth\.uid\(\)/);
  assert.match(body, /auth\.jwt\(\) ->> 'email'/);
  assert.match(body, /if uid is null then[\s\S]{0,120}not authenticated/);
});

test("acceptance: only pending invitations for the caller's own email are claimed", () => {
  const sql = repo("supabase/migrations/0010_team_invitations.sql");
  const body = sql.slice(sql.indexOf("create or replace function public.claim_business_invitations"));
  assert.match(body, /where status = 'pending' and lower\(email\) = user_email/);
});

test("acceptance: business and role come from the stored invitation row", () => {
  const sql = repo("supabase/migrations/0010_team_invitations.sql");
  const body = sql.slice(sql.indexOf("create or replace function public.claim_business_invitations"));
  assert.match(body, /values \(inv\.business_id, uid, inv\.role\)/);
});

test("acceptance: membership creation is idempotent and marks the invitation consumed", () => {
  const sql = repo("supabase/migrations/0010_team_invitations.sql");
  const body = sql.slice(sql.indexOf("create or replace function public.claim_business_invitations"));
  assert.match(body, /on conflict \(business_id, user_id\) do nothing/);
  assert.match(body, /set status = 'accepted', accepted_by = uid, accepted_at = now\(\)/);
});

test("acceptance: revoked and accepted invitations are outside the claim set", () => {
  const sql = repo("supabase/migrations/0010_team_invitations.sql");
  assert.match(sql, /business_invitations_status_check[\s\S]{0,90}'pending', 'accepted', 'revoked'/);
  const body = sql.slice(sql.indexOf("create or replace function public.claim_business_invitations"));
  assert.ok(body.includes("status = 'pending'"), "only pending rows are claimable");
});

test("acceptance: the app wrapper requires a session and returns a count only", () => {
  const fn = auth.slice(auth.indexOf("export async function claimBusinessInvitations"));
  assert.match(fn.slice(0, 400), /const user = await getUser\(\)[\s\S]{0,80}if \(!user\) return 0/);
  assert.ok(!fn.slice(0, 400).includes("formData"), "acceptance takes no caller input");
});

// --- error, logging and enumeration safety -----------------------------------

test("errors: no raw provider or database message reaches the user", () => {
  assert.ok(!/return \{ error: authError\.message \}/.test(actions), "raw auth error must not be returned");
  assert.ok(!/error: [a-zA-Z]+Error\.message/.test(actions));
  assert.match(actions, /error: "Could not save your account type\./);
  assert.match(actions, /error: "Could not create your business\./);
});

test("logs: onboarding logs carry stable codes only, never raw error objects", () => {
  assert.match(actions, /console\.error\("saveOnboardingIntent failed", profileError\.code\)/);
  assert.match(actions, /console\.error\("saveOnboardingIntent auth update failed", authError\.status\)/);
  assert.match(actions, /console\.error\("createBusiness failed", error\.code\)/);
  assert.ok(!/console\.error\([^)]*, *(profileError|error)\)/.test(actions), "no raw error object logged");
});

test("logs: invitation actions log a stable code, never the raw error object", () => {
  assert.match(invites, /console\.error\("inviteTeammate failed", error\.code\)/);
  assert.match(invites, /console\.error\("revokeInvitation failed", error\.code\)/);
  // A PostgrestError carries message/details/hint — logging the object whole
  // would put database text in the logs (APPSEC-07 posture).
  assert.ok(
    !/console\.error\([^)]*, *error\)/.test(invites),
    "no raw error object may be logged from the invitation actions",
  );
});

test("logs: no email, password or token is written to the onboarding logs", () => {
  for (const leak of ["password", "access_token", "refresh_token", "authorization", "jwt"]) {
    assert.ok(!actions.toLowerCase().includes(leak), `must not reference ${leak}`);
  }
});

test("errors: the duplicate-invite response does not confirm another tenant's data", () => {
  const fn = invites.slice(invites.indexOf("export async function inviteTeammate"));
  // 23505 is scoped to this business by the insert itself, so the message only
  // ever describes the caller's own business.
  assert.match(fn, /error\.code === "23505"/);
  assert.ok(!fn.includes("error.message"));
});

// --- registry and regression gates ------------------------------------------

test("registry: every onboarding mutation boundary is inventoried with its authority", () => {
  assert.ok(ONBOARDING_MUTATION_REGISTRY.length >= 5);
  for (const entry of ONBOARDING_MUTATION_REGISTRY) {
    assert.ok(entry.action && entry.file && entry.authority && entry.target);
  }
  const names = ONBOARDING_MUTATION_REGISTRY.map((e) => e.action);
  for (const expected of ["saveOnboardingIntent", "createBusiness", "inviteTeammate", "revokeInvitation", "claimBusinessInvitations"]) {
    assert.ok(names.includes(expected), `${expected} must be inventoried`);
  }
});

test("regression: no service-role client is used anywhere in onboarding", () => {
  for (const file of [ONBOARDING_ACTIONS, INVITE_ACTIONS, CALLBACK]) {
    assert.ok(!src(file).includes("createAdminClient"), `${file} must stay RLS-scoped`);
  }
});

test("regression: APPSEC-10 invitation expiry is still not implemented", () => {
  const sql = repo("supabase/migrations/0010_team_invitations.sql");
  assert.ok(!sql.includes("expires_at"), "no expiry column was added");
  assert.ok(!actions.includes("expires_at") && !invites.includes("expires_at"));
  assert.ok(!src("lib/validation/onboarding.js").includes("expires_at"));
});

test("regression: APPSEC-12 was not implemented in this phase", () => {
  const sql = repo("supabase/migrations/0009_platform_admins.sql");
  assert.ok(!/create trigger[\s\S]{0,80}platform_admins/.test(sql), "no audit trigger added");
  assert.ok(!actions.includes("platform_admins") && !invites.includes("platform_admins"));
});

test("regression: earlier phases' protections are untouched", () => {
  assert.match(src("lib/validation/notifications.js"), /columns are deliberately ignored/);
  assert.match(src("lib/validation/vehicle-media.js"), /authorizeStoredVehicleMediaPath/);
  assert.match(src("lib/validation/evidence.js"), /parseOwnedStoragePath/);
  assert.match(src("lib/validation/admin.js"), /adminIntent/);
});

test("regression: launch-ops, Stripe webhook and billing are untouched here", () => {
  assert.match(src("lib/actions/launch-ops.ts"), /createAdminClient/);
  assert.match(src("lib/stripe-webhook.ts"), /./);
  for (const file of [ONBOARDING_ACTIONS, INVITE_ACTIONS, CALLBACK]) {
    const body = src(file).toLowerCase();
    assert.ok(!body.includes("stripe"), `${file} must not touch billing`);
    assert.ok(!body.includes("launch-ops"), `${file} must not touch launch-ops`);
  }
});

test("regression: notification delivery remains disabled and untouched", () => {
  assert.match(src("lib/notifications/provider.js"), /NOTIFICATIONS_DISPATCH_ENABLED/);
  for (const file of [ONBOARDING_ACTIONS, INVITE_ACTIONS, CALLBACK]) {
    assert.ok(!src(file).includes("NOTIFICATIONS_LIVE_SEND_ENABLED"));
  }
});
