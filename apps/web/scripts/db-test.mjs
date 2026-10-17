#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Real-PostgreSQL harness for Revora's database security tests.
//
//   node scripts/db-test.mjs --reset                      # rebuild to latest
//   node scripts/db-test.mjs --reset --up-to 0038         # production-equivalent
//   node scripts/db-test.mjs --run ../../supabase/tests/foo.sql
//
// WHY
// Rule F of the Phase 1 remediation brief forbids calling a security property
// "fixed" because a test mocked the vulnerable layer. An RLS policy can only be
// exercised by PostgreSQL, so these tests run against a real database with the
// migrations applied from zero.
//
// WHERE IT RUNS
// Inside the project's existing local Supabase container, which already
// provides the real cluster roles (anon / authenticated / service_role), the
// real Postgres build and the real extension set -- but in a DEDICATED
// database, never the dev database.
//
// SAFETY
// `--reset` drops and recreates its target. PROTECTED_DATABASES below is a hard
// refusal list: the local dev database (`postgres`) holds real developer data
// and this script must never be the reason it disappears. Override the target
// with REVORA_TEST_DB only to point at another disposable database.
// ---------------------------------------------------------------------------
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const MIGRATIONS = join(REPO, "supabase/migrations");
const SHIM = join(REPO, "supabase/tests/_supabase_shim.sql");
const STORAGE_POLICIES = join(REPO, "supabase/policies/storage-policies.sql");

const CONTAINER = process.env.REVORA_DB_CONTAINER || "supabase_db_Revora-app";
const TEST_DB = process.env.REVORA_TEST_DB || "revora_sec_test";
// Matches the Postgres major version Supabase runs in production (17).
const FALLBACK_IMAGE = process.env.REVORA_DB_IMAGE || "postgres:17";
const PROTECTED_DATABASES = new Set([
  "postgres", "_supabase", "template0", "template1",
]);

if (PROTECTED_DATABASES.has(TEST_DB)) {
  process.stderr.write(
    `[db-test] refusing to use protected database "${TEST_DB}".\n` +
      "This harness drops its target; it must never point at the dev database.\n",
  );
  process.stdout.write("DB_HARNESS_REFUSED\n");
  process.exit(1);
}

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const value = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};

const docker = (args, opts = {}) =>
  execFileSync("docker", args, { encoding: "utf8", stdio: "pipe", ...opts });

// Uses the project's local Supabase database container when it exists (so a
// developer's `--reset` lands in the same Postgres build as production), and
// otherwise provisions a disposable plain-Postgres container. The second path
// is what CI takes: a GitHub runner has Docker but no Supabase stack, and the
// shim supplies the auth/storage objects either way.
function requireContainer() {
  let status;
  try {
    status = docker(["inspect", "-f", "{{.State.Status}}", CONTAINER]).trim();
  } catch {
    status = "absent";
  }

  if (status === "absent") {
    process.stderr.write(
      `[db-test] ${CONTAINER} not found; provisioning ${FALLBACK_IMAGE}\n`,
    );
    docker([
      "run", "-d", "--name", CONTAINER,
      "-e", "POSTGRES_PASSWORD=postgres",
      "-e", "POSTGRES_DB=postgres",
      FALLBACK_IMAGE,
    ]);
  } else if (status !== "running") {
    process.stderr.write(`[db-test] starting ${CONTAINER} (was ${status})\n`);
    docker(["start", CONTAINER]);
  }
  for (let i = 0; i < 60; i += 1) {
    try {
      docker(["exec", CONTAINER, "pg_isready", "-U", "postgres"]);
      return;
    } catch {
      execFileSync("sleep", ["1"]);
    }
  }
  throw new Error(`${CONTAINER} never became ready`);
}

// Admin statements run against template1 so they never hold a handle on the
// database being dropped.
function admin(sql) {
  return docker(
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "template1",
      "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
}

// Returns stdout AND stderr, interleaved order not preserved but both present.
// psql writes notices and `ERROR:` lines to stderr, and for the project's
// existing harnesses an ERROR next to a `must be REJECTED` banner IS the pass
// signal -- dropping stderr would make a suite look silently clean while
// proving nothing.
function psqlFile(path, { strict = true } = {}) {
  const res = spawnSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", TEST_DB,
      "-v", strict ? "ON_ERROR_STOP=1" : "ON_ERROR_STOP=0", "-X", "-q", "-f", "-"],
    { input: readFileSync(path, "utf8"), encoding: "utf8" },
  );
  const out = `${res.stdout || ""}${res.stderr || ""}`;
  if (strict && res.status !== 0) {
    const err = new Error(`psql failed (${res.status}) on ${path}`);
    err.stdout = res.stdout;
    err.stderr = res.stderr;
    throw err;
  }
  return out;
}

function query(sql) {
  return docker(
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", TEST_DB,
      "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

function migrationList() {
  const upTo = value("--up-to");
  const files = readdirSync(MIGRATIONS)
    .filter((f) => /^\d{4}.*\.sql$/.test(f))
    .sort();
  return upTo ? files.filter((f) => f.slice(0, 4) <= upTo) : files;
}

function resetDatabase() {
  process.stderr.write(`[db-test] recreating database ${TEST_DB}\n`);
  try {
    admin(
      `select pg_terminate_backend(pid) from pg_stat_activity ` +
        `where datname = '${TEST_DB}' and pid <> pg_backend_pid();`,
    );
  } catch {
    // nothing to evict, or peers we may not signal -- DROP reports the truth
  }
  admin(`drop database if exists ${TEST_DB};`);
  admin(`create database ${TEST_DB};`);
}

function applySchema() {
  process.stderr.write("[db-test] applying supabase shim\n");
  psqlFile(SHIM);
  const files = migrationList();
  for (const f of files) {
    try {
      psqlFile(join(MIGRATIONS, f));
    } catch (err) {
      process.stderr.write(
        `\n[db-test] MIGRATION FAILED: ${f}\n${err.stdout || ""}${err.stderr || ""}\n`,
      );
      process.stdout.write("DB_SCHEMA_FAILED\n");
      process.exit(1);
    }
  }
  if (existsSync(STORAGE_POLICIES)) {
    try {
      psqlFile(STORAGE_POLICIES);
    } catch (err) {
      process.stderr.write(
        `[db-test] storage policies skipped: ${err.stderr || err.message}\n`,
      );
    }
  }
  process.stdout.write(
    `migrations_applied=${files.length} last=${files[files.length - 1]} ` +
      `public_tables=${query("select count(*) from pg_tables where schemaname='public';")} ` +
      `public_policies=${query("select count(*) from pg_policies where schemaname='public';")}\n`,
  );
}

try {
  requireContainer();
  if (flag("--reset")) {
    resetDatabase();
    applySchema();
    process.stdout.write("DB_SCHEMA_OK\n");
  }
  const target = value("--run");
  if (target) {
    const path = resolve(process.cwd(), target);
    if (!existsSync(path)) throw new Error(`test file not found: ${path}`);
    // Test files manage ON_ERROR_STOP themselves: an expected rejection prints
    // an ERROR and must not abort the run.
    let out;
    try {
      out = psqlFile(path, { strict: false });
    } catch (err) {
      out = `${err.stdout || ""}${err.stderr || ""}`;
    }
    process.stdout.write(out);
  }
} catch (err) {
  process.stderr.write(
    `[db-test] ${err.message}\n${err.stdout || ""}${err.stderr || ""}\n`,
  );
  process.stdout.write("DB_HARNESS_FAILED\n");
  process.exit(1);
}
