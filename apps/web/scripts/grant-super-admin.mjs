// Grant (or revoke) platform super-admin to an existing user, out-of-band.
//
// This is the SAFE bootstrap path for the FIRST super admin: it uses the
// Supabase service-role key (never exposed to the browser) and is run by an
// operator from a trusted machine. After the first admin exists, further admins
// can be managed from the /admin/admins screen.
//
// Usage (from apps/web):
//   node scripts/grant-super-admin.mjs <email> [--revoke]
//
// Env:
//   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnvLocal() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* no .env.local — rely on real env */
  }
}
loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const positional = args.filter((arg) => !arg.startsWith("--"));
const email = positional[0];
const unknownFlags = args.filter((arg) => arg.startsWith("--") && arg !== "--revoke");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

if (positional.length !== 1) {
  fail("Usage: node scripts/grant-super-admin.mjs <email> [--revoke]");
}
if (unknownFlags.length > 0) {
  fail(`Unknown flag(s): ${unknownFlags.join(", ")}`);
}
if (!isEmail(email)) fail(`Invalid email address: ${email}`);
if (!supabaseUrl) {
  fail(
    "NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) is required. Export the target Supabase URL before running this script.",
  );
}
if (!SERVICE_KEY) {
  fail("SUPABASE_SERVICE_ROLE_KEY is required and must be exported locally.");
}

const admin = createClient(supabaseUrl, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Find the user by email (paginate through the admin user list).
let userId = null;
for (let page = 1; page <= 50 && !userId; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    fail(`listUsers failed: ${error.message}`);
  }
  const match = data.users.find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (match) userId = match.id;
  if (data.users.length < 200) break;
}

if (!userId) {
  fail(`No user with email ${email}. They must sign up first.`);
}

const { data: existingAdmin, error: existingAdminError } = await admin
  .from("platform_admins")
  .select("user_id")
  .eq("user_id", userId)
  .maybeSingle();
if (existingAdminError) {
  fail(`platform_admins lookup failed: ${existingAdminError.message}`);
}

if (revoke) {
  if (!existingAdmin) {
    console.log(`${email} is not currently a super admin.`);
    process.exit(0);
  }
  const { error } = await admin.from("platform_admins").delete().eq("user_id", userId);
  if (error) {
    fail(`revoke failed: ${error.message}`);
  }
  console.log(`Revoked super admin from ${email}.`);
} else {
  if (existingAdmin) {
    console.log(`${email} is already a super admin.`);
    process.exit(0);
  }
  const { error } = await admin
    .from("platform_admins")
    .upsert({ user_id: userId }, { onConflict: "user_id" });
  if (error) {
    fail(`grant failed: ${error.message}`);
  }
  console.log(`Granted super admin to ${email}.`);
}
