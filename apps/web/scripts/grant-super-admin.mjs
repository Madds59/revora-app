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
// Env (falls back to local Supabase defaults if unset):
//   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL
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

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const email = process.argv[2];
const revoke = process.argv.includes("--revoke");

if (!email) {
  console.error("Usage: node scripts/grant-super-admin.mjs <email> [--revoke]");
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is not set (check .env.local or env).");
  process.exit(1);
}

const admin = createClient(supabaseUrl, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Find the user by email (paginate through the admin user list).
let userId = null;
for (let page = 1; page <= 50 && !userId; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error("listUsers failed:", error.message);
    process.exit(1);
  }
  const match = data.users.find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (match) userId = match.id;
  if (data.users.length < 200) break;
}

if (!userId) {
  console.error(`No user with email ${email}. They must sign up first.`);
  process.exit(1);
}

if (revoke) {
  const { error } = await admin.from("platform_admins").delete().eq("user_id", userId);
  if (error) {
    console.error("revoke failed:", error.message);
    process.exit(1);
  }
  console.log(`Revoked super admin from ${email}.`);
} else {
  const { error } = await admin
    .from("platform_admins")
    .upsert({ user_id: userId }, { onConflict: "user_id" });
  if (error) {
    console.error("grant failed:", error.message);
    process.exit(1);
  }
  console.log(`Granted super admin to ${email}.`);
}
