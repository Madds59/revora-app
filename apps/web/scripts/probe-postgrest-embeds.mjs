#!/usr/bin/env node
// End-to-end proof for the PGRST201 class.
//
// audit-postgrest-embeds.mjs reasons about the schema. This sends every
// distinct embed the app issues to a real PostgREST and reads the answer, so a
// constraint name that is merely plausible is caught: a wrong one returns
// PGRST200 ("could not find a relationship"), an unhinted one returns PGRST201.
//
// Only the request parser is being tested, so the anon key is enough. Embed
// resolution happens BEFORE row-level security, which means a 401 from an RLS
// helper proves the embed resolved; it is a pass here, not a failure. Nothing
// is written and `limit=0` keeps every response empty.
//
// WHICH DATABASE
// The target must be a database that actually carries migration 0039's
// composite foreign keys. The local dev stack usually does not, and probing it
// would "pass" while proving nothing -- so the run starts with a positive
// control that must fail. If the deliberately ambiguous control does NOT come
// back PGRST201, this reports UNAVAILABLE instead of OK.
//
//   REVORA_PROBE_URL=https://<ref>.supabase.co \
//   REVORA_PROBE_ANON_KEY=<anon key> \
//   node scripts/probe-postgrest-embeds.mjs
//
// Defaults come from .env.local when the variables are not set.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { queriesIn } from "./audit-postgrest-embeds.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");

function fromEnvFile(key) {
  try {
    const text = readFileSync(join(APP, ".env.local"), "utf8");
    const line = text.split("\n").find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim() : undefined;
  } catch {
    return undefined;
  }
}

const BASE = (process.env.REVORA_PROBE_URL || fromEnvFile("NEXT_PUBLIC_SUPABASE_URL") || "")
  .replace(/\/+$/, "");
const KEY = process.env.REVORA_PROBE_ANON_KEY || fromEnvFile("NEXT_PUBLIC_SUPABASE_ANON_KEY") || "";

if (!BASE || !KEY) {
  process.stderr.write(
    "set REVORA_PROBE_URL and REVORA_PROBE_ANON_KEY (or populate .env.local)\n",
  );
  process.stdout.write("EMBED_PROBE_UNAVAILABLE\n");
  process.exit(1);
}

// A schema-cache error: the request never reached row-level security.
// PGRST201 = ambiguous embed, PGRST200 = no such relationship (a wrong hint).
const SCHEMA_ERRORS = new Set(["PGRST200", "PGRST201"]);

async function probe(table, select) {
  const url = `${BASE}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=0`;
  const res = await fetch(url, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  let code = null;
  try {
    const body = await res.json();
    if (body && !Array.isArray(body)) code = body.code ?? null;
  } catch {
    /* an empty or non-JSON body carries no error code */
  }
  return { status: res.status, code };
}

// --- positive control ------------------------------------------------------
// An embed with no constraint hint across a pair migration 0039 made
// ambiguous. If this does not fail, the target schema cannot prove anything
// about the real probes.
const CONTROL = { table: "vehicles", select: "id, customers(full_name)" };

const control = await probe(CONTROL.table, CONTROL.select);
if (control.code !== "PGRST201") {
  process.stderr.write(
    `positive control did not fail: ${CONTROL.table}?select=${CONTROL.select} ` +
      `returned status=${control.status} code=${control.code ?? "none"}.\n` +
      `${BASE} does not carry the composite foreign keys from migration 0039, ` +
      "so a clean run here would prove nothing. Point the probe at the deployed " +
      "database with REVORA_PROBE_URL / REVORA_PROBE_ANON_KEY.\n",
  );
  process.stdout.write("EMBED_PROBE_UNAVAILABLE\n");
  process.exit(1);
}
process.stdout.write(
  `control ok: unhinted embed rejected with ${control.code} (status ${control.status})\n`,
);

// --- every embed the app actually issues -----------------------------------
function sourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

const queries = new Map();
let skipped = 0;
for (const file of sourceFiles(join(APP, "src"))) {
  for (const q of queriesIn(readFileSync(file, "utf8"))) {
    if (!q.select.includes("(")) continue; // no embed, nothing to resolve
    if (q.select.includes("${")) {
      // An interpolated select cannot be reconstructed statically.
      skipped += 1;
      continue;
    }
    queries.set(`${q.table}|${q.select}`, q);
  }
}

const failures = [];
const other = [];
for (const q of queries.values()) {
  const { status, code } = await probe(q.table, q.select);
  if (code && SCHEMA_ERRORS.has(code)) {
    failures.push({ ...q, status, code });
  } else if (code && code !== "42501") {
    other.push({ ...q, status, code });
  }
}

process.stdout.write(
  `target=${BASE} embeds=${queries.size} skipped_interpolated=${skipped} ` +
    `schema_errors=${failures.length}\n`,
);

for (const o of other) {
  process.stdout.write(`  note ${o.table}: status=${o.status} code=${o.code}\n`);
}

if (failures.length) {
  process.stdout.write("Embeds rejected by PostgREST:\n");
  for (const f of failures) {
    process.stdout.write(`  - ${f.table} [${f.code}] ${f.select}\n`);
  }
  process.stdout.write("EMBED_PROBE_FAILED\n");
  process.exit(1);
}

if (queries.size === 0) {
  process.stderr.write("no embeds found to probe -- the extractor is wrong\n");
  process.stdout.write("EMBED_PROBE_FAILED\n");
  process.exit(1);
}

process.stdout.write("EMBED_PROBE_OK\n");
