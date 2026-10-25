#!/usr/bin/env node
// Pages and sections must not read a Supabase result without reading its error.
//
// `const { data } = await supabase.from(...)` is the shape that hid the PGRST201
// outage: on failure `data` is null, `data ?? []` is an empty array, and the page
// renders its empty state -- telling a business with three vehicles to add one.
// The `notFound()` variant is worse: a failed query becomes "this invoice does
// not exist". Nothing is logged either way.
//
// SCOPE
// Every .ts/.tsx file under src, minus PENDING below: the files still carrying
// the shape, each with the count found when it was listed. A file is protected
// the moment it is cleaned, because cleaning it means removing it from PENDING.
// A PENDING file that no longer discards anything also FAILS, so the list
// cannot quietly rot into an allowlist for code that was fixed long ago.
//
// Fixing a hit means unwrapRow/unwrapRows/unwrapCount from lib/supabase/unwrap.js,
// which raises so the route's error.tsx boundary renders, or binding the error and
// reporting it where a soft-failing panel is deliberate.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** A destructure binding `data` (or an alias) with no `error` beside it. */
const DESTRUCTURE = /\{\s*data(?:\s*:\s*([A-Za-z_$][\w$]*))?\s*\}/;

function filesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "node_modules") out.push(...filesUnder(path));
    } else if (/\.(ts|tsx)$/.test(path)) out.push(path);
  }
  return out;
}

// Empty, and meant to stay that way. It exists so a file can be exempted
// deliberately and visibly, with the count it carried, rather than by nobody
// noticing. An entry that is already clean, or whose count has grown, fails.
const PENDING = new Map([]);

export function discardsIn(file) {
  const lines = readFileSync(file, "utf8").split("\n");
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (!DESTRUCTURE.test(lines[i])) continue;
    if (/\berror\b/.test(lines[i])) continue;
    // The statement this destructure opens, so a multi-line query chain counts.
    let statement = lines[i];
    for (let j = i; j < lines.length - 1 && !/;\s*$/.test(lines[j]); ) {
      j += 1;
      statement += "\n" + lines[j];
    }
    if (!/\bsupabase\b|\badmin\b/.test(statement)) continue;
    hits.push({ line: i + 1, text: lines[i].trim() });
  }
  return hits;
}

// --- positive control ------------------------------------------------------
// A scanner that never fires proves nothing. This feeds the detector the exact
// shape it exists to catch, and the fixed shape it must stay quiet about.
if (process.argv.includes("--self-test")) {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "discard-audit-"));
  const write = (name, body) => {
    const p = join(dir, name);
    writeFileSync(p, body);
    return p;
  };

  const bad = write(
    "bad.tsx",
    `const { data } = await supabase\n  .from("invoices")\n  .select("id");\n`,
  );
  const badAlias = write(
    "bad-alias.tsx",
    `const { data: rows } = await supabase.from("jobs").select("id");\n`,
  );
  const good = write(
    "good.tsx",
    `const { data, error } = await supabase.from("invoices").select("id");\n`,
  );
  const unwrapped = write(
    "unwrapped.tsx",
    `const rowsResult = await supabase.from("jobs").select("id");\n` +
      `const rows = unwrapRows(rowsResult, "jobs");\n`,
  );

  const problems = [];
  if (discardsIn(bad).length !== 1) problems.push("missed a bare `{ data }` discard");
  if (discardsIn(badAlias).length !== 1) problems.push("missed an aliased `{ data: rows }` discard");
  if (discardsIn(good).length !== 0) problems.push("flagged a result that reads its error");
  if (discardsIn(unwrapped).length !== 0) problems.push("flagged an unwrapped result");
  rmSync(dir, { recursive: true, force: true });

  if (problems.length) {
    for (const p of problems) console.error(`  - ${p}`);
    console.log("DISCARD_AUDIT_SELFTEST_FAILED");
    process.exit(1);
  }
  console.log("control ok: discards detected, clean shapes left alone");
  console.log("DISCARD_AUDIT_SELFTEST_OK");
  process.exit(0);
}

const all = filesUnder(SRC).sort();
const rel = (file) => file.replace(SRC + "/", "");

if (process.argv.includes("--list-pending")) {
  let total = 0;
  for (const file of all) {
    const hits = discardsIn(file);
    if (!hits.length) continue;
    total += hits.length;
    console.log(`  ${rel(file)}: ${hits.map((h) => h.line).join(", ")}`);
  }
  console.log(`still discarding: ${total}`);
  process.exit(0);
}

const failures = [];
const seen = new Set();
let guarded = 0;

for (const file of all) {
  const name = rel(file);
  const hits = discardsIn(file);
  if (PENDING.has(name)) {
    seen.add(name);
    const expected = PENDING.get(name);
    if (hits.length === 0) {
      failures.push(`${name} no longer discards anything -- remove it from PENDING`);
    } else if (hits.length > expected) {
      failures.push(
        `${name} now discards ${hits.length} results, up from the ${expected} on the list`,
      );
    }
    continue;
  }
  guarded += 1;
  for (const hit of hits) failures.push(`${name}:${hit.line}  ${hit.text}`);
}

for (const name of PENDING.keys()) {
  if (!seen.has(name)) failures.push(`PENDING lists ${name}, which no longer exists`);
}

const left = [...PENDING.values()].reduce((a, b) => a + b, 0);
console.log(`files guarded: ${guarded}   still on the list: ${PENDING.size} files, ${left} sites`);
if (failures.length) {
  console.error(`\nDiscarded query errors (${failures.length}):`);
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    "\nUse unwrapRow/unwrapRows/unwrapCount from @/lib/supabase/unwrap.js, or bind\n" +
      "the error and reportError() it where failing soft is deliberate.",
  );
  console.log("DISCARD_AUDIT_FAILED");
  process.exit(1);
}
console.log("DISCARD_AUDIT_OK");
