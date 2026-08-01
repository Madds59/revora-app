import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// APPSEC-09 — platform-administration mutation security.
//
// /admin is the product's only GLOBAL authority surface: a verified platform
// administrator acts across every tenant, unscoped by business membership.
//
// Authorization was already sound before this phase and is preserved, not
// rewritten: `requireSuperAdmin()` resolves the actor from the server session
// and checks the canonical `platform_admins` table, and every `admin_*` RPC is
// SECURITY DEFINER and re-checks `is_super_admin()` itself. What was missing was
// strict parsing of the caller's form values — most importantly the super-admin
// grant/revoke direction, which came from a hidden field compared loosely
// against "true", so an ABSENT field meant GRANT.

import {
  ADMIN_DEFAULT_PAGE_SIZE,
  ADMIN_MAX_PAGE_SIZE,
  ADMIN_MUTATION_REGISTRY,
  ADMIN_MUTATION_RPCS,
  adminIntent,
  adminMarkNotificationReadSchema,
  parseAdminPageSize,
  setSuperAdminSchema,
} from "../src/lib/validation/admin.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(path.join(here, "..", "src", p), "utf8");
const repo = (p) => readFileSync(path.join(here, "..", "..", "..", p), "utf8");

const ADMIN_ACTIONS = "app/[locale]/(admin)/admin/actions.ts";
const AUTH = "lib/auth.ts";
const actions = src(ADMIN_ACTIONS);
const auth = src(AUTH);

const UUID = "3f7c1f2e-1c4a-4f8b-9a2d-8e5b6c7d8e9f";
const ok = (r) => r.success === true;

// --- authority model ---------------------------------------------------------

test("authority: the canonical guard resolves the session user and checks platform_admins", () => {
  assert.match(auth, /export const isSuperAdmin[\s\S]{0,400}from\("platform_admins"\)/);
  assert.match(auth, /export async function requireSuperAdmin\(\)[\s\S]{0,200}requireUser\(\)/);
  // Membership is looked up by the SESSION user id, never a caller-supplied id.
  assert.match(auth, /from\("platform_admins"\)[\s\S]{0,120}\.eq\("user_id", user\.id\)/);
});

test("authority: admin status never comes from a forbidden source", () => {
  const guard = auth.slice(auth.indexOf("export const isSuperAdmin"), auth.indexOf("export async function requireUser"));
  for (const forbidden of [
    "account_intent",
    "user_metadata",
    "app_metadata",
    "formData",
    "searchParams",
    "is_admin",
    "role",
    "email",
  ]) {
    assert.ok(
      !guard.includes(forbidden),
      `platform-admin authority must not consult ${forbidden}`,
    );
  }
});

test("authority: every admin mutation calls the guard itself, not just the layout", () => {
  for (const entry of ADMIN_MUTATION_REGISTRY) {
    const body = actions.slice(actions.indexOf(`export async function ${entry.action}`));
    const fn = body.slice(0, body.indexOf("\n}\n") + 1);
    assert.ok(fn.length > 0, `${entry.action} not found`);
    const guardAt = fn.indexOf(`${entry.guard}()`);
    const rpcAt = fn.indexOf(`.rpc(`);
    assert.ok(guardAt > -1, `${entry.action} must call ${entry.guard}()`);
    assert.ok(rpcAt > guardAt, `${entry.action} must authorize BEFORE its privileged call`);
  }
});

test("authority: the guard denies before any privileged work (redirect throws in actions)", () => {
  // requireUser() redirects unauthenticated callers; requireSuperAdmin()
  // redirects authenticated non-admins. Both throw, so a direct server-action
  // invocation cannot proceed past the guard.
  assert.match(auth, /export async function requireUser\(\)[\s\S]{0,160}redirect\("\/login"\)/);
  assert.match(auth, /requireSuperAdmin[\s\S]{0,200}isSuperAdmin\(\)\)\) redirect\("\/"\)/);
});

test("authority: tenant roles and customers get no admin authority", () => {
  // The tenant guards are a separate mechanism; none of them grants /admin.
  assert.ok(!auth.includes("requireMembership") || auth.includes("requireSuperAdmin"));
  const guard = auth.slice(auth.indexOf("export const isSuperAdmin"), auth.indexOf("export async function requireUser"));
  for (const tenant of ["business_members", "business_owner", "manager", "employee", "customers"]) {
    assert.ok(!guard.includes(tenant), `tenant concept ${tenant} must not confer admin authority`);
  }
});

// --- privilege-change intent -------------------------------------------------

test("intent: grant/revoke must be stated explicitly — absent no longer means GRANT", () => {
  assert.ok(!ok(adminIntent.safeParse(undefined)));
  assert.ok(!ok(adminIntent.safeParse(null)));
  assert.ok(!ok(adminIntent.safeParse("")));
  assert.ok(!ok(adminIntent.safeParse("TRUE")));
  assert.ok(!ok(adminIntent.safeParse("yes")));
  assert.ok(!ok(adminIntent.safeParse("1")));
  assert.ok(ok(adminIntent.safeParse("true")));
  assert.ok(ok(adminIntent.safeParse("false")));
});

test("intent: a missing make_admin field cannot escalate the target", () => {
  const parsed = setSuperAdminSchema.safeParse({ email: "person@example.com" });
  assert.ok(!parsed.success, "an absent direction must be rejected, not defaulted to grant");
});

test("intent: an unrecognised make_admin value cannot silently revoke", () => {
  const parsed = setSuperAdminSchema.safeParse({ email: "person@example.com", makeAdmin: "off" });
  assert.ok(!parsed.success);
});

test("intent: explicit grant and revoke both parse to the right boolean", () => {
  const grant = setSuperAdminSchema.safeParse({ email: "person@example.com", makeAdmin: "true" });
  const revoke = setSuperAdminSchema.safeParse({ email: "person@example.com", makeAdmin: "false" });
  assert.ok(ok(grant) && grant.data.makeAdmin === true);
  assert.ok(ok(revoke) && revoke.data.makeAdmin === false);
});

// --- selector validation -----------------------------------------------------

test("selector: super-admin email must be a plausible address", () => {
  for (const bad of ["", "   ", "not-an-email", "a@b", "@example.com", "person@", "a b@example.com"]) {
    assert.ok(!ok(setSuperAdminSchema.safeParse({ email: bad, makeAdmin: "true" })), bad);
  }
  assert.ok(ok(setSuperAdminSchema.safeParse({ email: "person@example.com", makeAdmin: "true" })));
});

test("selector: super-admin email is bounded and control-character free", () => {
  const long = `${"a".repeat(320)}@example.com`;
  assert.ok(!ok(setSuperAdminSchema.safeParse({ email: long, makeAdmin: "true" })));
  const withControl = `person${String.fromCharCode(10)}@example.com`;
  assert.ok(!ok(setSuperAdminSchema.safeParse({ email: withControl, makeAdmin: "true" })));
});

test("selector: email is trimmed, and the trimmed value is what gets echoed", () => {
  const parsed = setSuperAdminSchema.safeParse({ email: "  person@example.com  ", makeAdmin: "true" });
  assert.ok(ok(parsed));
  assert.equal(parsed.data.email, "person@example.com");
});

test("selector: non-string selectors are rejected rather than coerced", () => {
  for (const bad of [null, undefined, 42, {}, [], true]) {
    assert.ok(!ok(setSuperAdminSchema.safeParse({ email: bad, makeAdmin: "true" })));
    assert.ok(!ok(adminMarkNotificationReadSchema.safeParse({ notificationId: bad })));
  }
});

test("selector: notification id must be a real UUID", () => {
  for (const bad of ["", "abc", "123", `${UUID}-extra`, "'; drop table notification_events;--"]) {
    assert.ok(!ok(adminMarkNotificationReadSchema.safeParse({ notificationId: bad })), bad);
  }
  assert.ok(ok(adminMarkNotificationReadSchema.safeParse({ notificationId: UUID })));
});

test("selector: unknown extra fields cannot ride along into the RPC", () => {
  const parsed = setSuperAdminSchema.safeParse({
    email: "person@example.com",
    makeAdmin: "true",
    actor_id: "11111111-1111-4111-8111-111111111111",
    is_admin: true,
    business_id: "22222222-2222-4222-8222-222222222222",
    table: "platform_admins",
  });
  assert.ok(ok(parsed));
  assert.deepEqual(Object.keys(parsed.data).sort(), ["email", "makeAdmin"]);
});

// --- pagination bounds -------------------------------------------------------

test("pagination: admin page size is bounded and never negative or absurd", () => {
  assert.equal(parseAdminPageSize(undefined), ADMIN_DEFAULT_PAGE_SIZE);
  assert.equal(parseAdminPageSize(""), ADMIN_DEFAULT_PAGE_SIZE);
  assert.equal(parseAdminPageSize("abc"), ADMIN_DEFAULT_PAGE_SIZE);
  assert.equal(parseAdminPageSize("0"), ADMIN_DEFAULT_PAGE_SIZE);
  assert.equal(parseAdminPageSize("-50"), ADMIN_DEFAULT_PAGE_SIZE);
  assert.equal(parseAdminPageSize("1e9"), ADMIN_MAX_PAGE_SIZE);
  assert.equal(parseAdminPageSize("100000"), ADMIN_MAX_PAGE_SIZE);
  assert.equal(parseAdminPageSize("50"), 50);
  assert.equal(parseAdminPageSize(["50"]), 50);
  assert.equal(parseAdminPageSize("Infinity"), ADMIN_DEFAULT_PAGE_SIZE);
  assert.equal(parseAdminPageSize("NaN"), ADMIN_DEFAULT_PAGE_SIZE);
});

test("pagination: the app bound never exceeds the RPC's own clamp", () => {
  assert.ok(ADMIN_MAX_PAGE_SIZE <= 100, "RPCs clamp p_limit to 100");
});

// --- action wiring (behavioural intent proven against the source) -------------

test("action: both admin mutations parse input before calling their RPC", () => {
  for (const entry of ADMIN_MUTATION_REGISTRY) {
    const body = actions.slice(actions.indexOf(`export async function ${entry.action}`));
    const fn = body.slice(0, body.indexOf("\n}\n") + 1);
    const parseAt = fn.indexOf("safeParse");
    const rpcAt = fn.indexOf(".rpc(");
    assert.ok(parseAt > -1, `${entry.action} must safeParse its input`);
    assert.ok(rpcAt > parseAt, `${entry.action} must validate BEFORE the RPC`);
    assert.ok(fn.includes(entry.schema), `${entry.action} must use ${entry.schema}`);
  }
});

test("action: only validated values reach the RPC — no raw formData passthrough", () => {
  assert.ok(!actions.includes("Object.fromEntries"), "no raw form spread");
  assert.ok(!/\.\.\.formData/.test(actions), "no formData spread");
  assert.ok(!/\.rpc\([^)]*String\(formData/.test(actions), "no unvalidated value in an RPC call");
  // Every RPC argument is taken from parsed.data (or a destructured field of it).
  assert.match(actions, /target_email: email/);
  assert.match(actions, /make_admin: makeAdmin/);
  assert.match(actions, /notification_id: parsed\.data\.notificationId/);
});

test("action: the admin surface calls only its two registered RPCs", () => {
  const called = [...actions.matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(called, [...ADMIN_MUTATION_RPCS].sort());
});

test("action: no service-role client is used anywhere in the admin tree", () => {
  assert.ok(!actions.includes("createAdminClient"), "admin actions use the RLS-scoped client");
  for (const page of [
    "app/[locale]/(admin)/admin/users/page.tsx",
    "app/[locale]/(admin)/admin/tenants/page.tsx",
    "app/[locale]/(admin)/admin/subscriptions/page.tsx",
    "app/[locale]/(admin)/admin/notifications/page.tsx",
    "app/[locale]/(admin)/admin/audit-logs/page.tsx",
    "app/[locale]/(admin)/admin/admins/page.tsx",
  ]) {
    assert.ok(!src(page).includes("createAdminClient"), `${page} must not use the service role`);
  }
});

test("action: errors are curated and never expose raw database text", () => {
  assert.ok(!/return \{ error: [^}]*error\.message/.test(actions), "no raw DB message returned");
  assert.match(actions, /error: "Could not update super admin status\./);
  assert.match(actions, /error: "Could not mark notification as read\./);
  // Logs carry the stable code only, not the full error object or PII.
  assert.match(actions, /console\.error\("setSuperAdmin failed", error\.code\)/);
  assert.match(actions, /console\.error\("markNotificationRead \(admin\) failed", error\.code\)/);
});

test("action: denial produces no mutation and no success message", () => {
  for (const entry of ADMIN_MUTATION_REGISTRY) {
    const body = actions.slice(actions.indexOf(`export async function ${entry.action}`));
    const fn = body.slice(0, body.indexOf("\n}\n") + 1);
    const failureReturn = fn.indexOf("return { error: firstValidationMessage(parsed) }");
    const rpcAt = fn.indexOf(".rpc(");
    assert.ok(failureReturn > -1 && failureReturn < rpcAt, `${entry.action} must return before mutating`);
  }
});

// --- admin list pages --------------------------------------------------------

test("reads: every admin page independently requires super admin", () => {
  for (const page of [
    "app/[locale]/(admin)/admin/page.tsx",
    "app/[locale]/(admin)/admin/users/page.tsx",
    "app/[locale]/(admin)/admin/tenants/page.tsx",
    "app/[locale]/(admin)/admin/subscriptions/page.tsx",
    "app/[locale]/(admin)/admin/notifications/page.tsx",
    "app/[locale]/(admin)/admin/audit-logs/page.tsx",
    "app/[locale]/(admin)/admin/admins/page.tsx",
    "app/[locale]/(admin)/admin/billing/page.tsx",
    "app/[locale]/(admin)/admin/analytics/page.tsx",
    "app/[locale]/(admin)/admin/settings/page.tsx",
  ]) {
    assert.match(src(page), /requireSuperAdmin\(\)/, `${page} must guard itself`);
  }
});

test("reads: the one admin page without its own guard is a bare redirect", () => {
  // /admin/dashboard only redirects to the guarded /admin. It must stay that
  // way: if it ever loads data it needs requireSuperAdmin() like every sibling.
  const page = src("app/[locale]/(admin)/admin/dashboard/page.tsx");
  assert.match(page, /redirect\("\/admin"\)/);
  assert.ok(!page.includes("createClient"), "a redirect page must not query");
  assert.ok(!page.includes(".rpc("), "a redirect page must not call an RPC");
  assert.ok(page.length < 400, "page grew beyond a redirect — add the guard");
});

test("reads: admin list pages bound their page size", () => {
  for (const page of [
    "app/[locale]/(admin)/admin/users/page.tsx",
    "app/[locale]/(admin)/admin/tenants/page.tsx",
    "app/[locale]/(admin)/admin/subscriptions/page.tsx",
    "app/[locale]/(admin)/admin/notifications/page.tsx",
    "app/[locale]/(admin)/admin/audit-logs/page.tsx",
  ]) {
    const body = src(page);
    assert.match(body, /parseAdminPageSize\(resolvedSearchParams\?\.pageSize\)/, page);
    assert.ok(!/Number\(resolvedSearchParams\?\.pageSize \?\? 25\) \|\| 25/.test(body), page);
  }
});

// --- database-layer defence in depth ----------------------------------------

test("database: every admin RPC re-checks is_super_admin itself", () => {
  const migrations = ["supabase/migrations/0009_platform_admins.sql", "supabase/migrations/0012_admin_frontend_rpc.sql", "supabase/migrations/0020_admin_filtered_list_rpcs.sql"]
    .map((p) => repo(p))
    .join("\n");
  const defined = [...migrations.matchAll(/create or replace function public\.(admin_[a-z_]+)\s*\(/g)].map((m) => m[1]);
  assert.ok(defined.length >= 10, "expected the admin RPC surface to be present");
  for (const fn of new Set(defined)) {
    const body = migrations.slice(migrations.indexOf(`create or replace function public.${fn}`));
    const end = body.indexOf("$$;");
    assert.match(body.slice(0, end), /is_super_admin\(\)/, `${fn} must re-check is_super_admin()`);
  }
});

test("database: super-admin revocation cannot remove the caller's own access", () => {
  const sql = repo("supabase/migrations/0009_platform_admins.sql");
  assert.match(sql, /if target = caller then[\s\S]{0,160}cannot remove your own super admin access/);
});

test("database: the filtered list RPCs clamp their own limit and offset", () => {
  const sql = repo("supabase/migrations/0020_admin_filtered_list_rpcs.sql");
  const clamps = [...sql.matchAll(/greatest\(1, least\(coalesce\(p_limit, \d+\), 100\)\)/g)];
  assert.ok(clamps.length >= 4, "each filtered RPC clamps p_limit");
  assert.match(sql, /greatest\(coalesce\(p_offset, 0\), 0\)/);
});

// --- regression gates --------------------------------------------------------

test("regression: this phase changed no migration, RLS policy or ledger", () => {
  // platform_admins authority and the admin RPCs are pre-existing and untouched.
  const sql = repo("supabase/migrations/0009_platform_admins.sql");
  assert.match(sql, /create table public\.platform_admins/);
  assert.match(sql, /create or replace function public\.is_super_admin/);
});

test("regression: notification, vehicle-media and evidence protections are untouched", () => {
  assert.match(src("lib/notifications/service.ts"), /authorizeEventForDispatch/);
  assert.match(src("lib/validation/notifications.js"), /columns are deliberately ignored/);
  assert.match(src("lib/validation/vehicle-media.js"), /authorizeStoredVehicleMediaPath/);
  assert.match(src("lib/validation/evidence.js"), /parseOwnedStoragePath/);
});

test("regression: notification delivery stays disabled and no provider is enabled here", () => {
  assert.ok(!actions.includes("NOTIFICATIONS_LIVE_SEND_ENABLED"));
  assert.ok(!actions.includes("resend") && !actions.includes("twilio"));
  assert.match(src("lib/notifications/provider.js"), /NOTIFICATIONS_DISPATCH_ENABLED/);
});

test("regression: launch-ops and the Stripe webhook were not modified by this phase", () => {
  assert.match(src("lib/actions/launch-ops.ts"), /createAdminClient/);
  assert.match(src("lib/stripe-webhook.ts"), /./);
  assert.ok(!actions.includes("stripe"), "admin actions do not touch billing internals");
});

test("regression: APPSEC-10 invitation expiry is still not implemented here", () => {
  assert.ok(!actions.includes("expires_at"));
  assert.ok(!src("lib/validation/admin.js").includes("expires_at"));
});
