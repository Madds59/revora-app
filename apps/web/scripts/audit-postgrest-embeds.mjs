#!/usr/bin/env node
// Systematic audit for the PGRST201 class.
//
// INVARIANT: every PostgREST embed the app issues must resolve to exactly one
// foreign key.
//
// Migration 0039 (and 0043 for the tables it adds) gives every tenant-owned
// parent/child reference a composite `(fk_column, business_id)` foreign key
// ALONGSIDE the original single-column one. That is the right call for
// integrity -- see audit-tenant-fks.mjs -- but PostgREST builds its embed graph
// from pg_constraint, so a second foreign key between the same table pair makes
//
//     .select("id, customers(full_name)")
//
// ambiguous. PostgREST answers HTTP 300 / PGRST201 and returns no rows. That
// happens during request parsing, BEFORE row-level security is evaluated, so it
// fails identically for every user and is invisible in the database itself.
// The embed must name its constraint:
//
//     .select("id, customers!vehicles_customer_id_fkey(full_name)")
//
// WHERE THE RELATION SET COMES FROM
// The ambiguous pairs are read from the migrated test database, not from a
// checked-in list, so a migration that adds a foreign key later makes the
// affected embeds fail this audit automatically. `--self-test` runs the
// detector against fixtures that must and must not be caught, because an audit
// for an absence proves nothing until it is shown able to fail.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const SOURCE_ROOT = join(APP, "src");

const CONTAINER = process.env.REVORA_DB_CONTAINER || "supabase_db_Revora-app";
const DB = process.env.REVORA_TEST_DB || "revora_sec_test";

// Every (child, parent) pair carrying more than one foreign key, with the
// constraint names an embed may choose between.
const SQL = `
select child, parent, string_agg(conname, ',' order by conname) as constraints
from (
  select con.conrelid::regclass::text as child,
         replace(con.confrelid::regclass::text, 'auth.', '') as parent,
         con.conname
  from pg_constraint con
  join pg_class cls on cls.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = cls.relnamespace
  where con.contype = 'f' and nsp.nspname = 'public'
) fks
group by child, parent
having count(*) > 1
order by child, parent;`;

/** `!inner` / `!left` choose a join type, not a constraint -- they disambiguate nothing. */
const JOIN_MODIFIERS = new Set(["inner", "left"]);

function ambiguousPairs() {
  const raw = execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", DB,
      "-X", "-q", "-t", "-A", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", SQL],
    { encoding: "utf8" },
  );
  const pairs = new Map();
  for (const line of raw.split("\n").filter(Boolean)) {
    const [child, parent, constraints] = line.split("\t");
    pairs.set(`${child}>${parent}`, constraints.split(","));
  }
  return pairs;
}

function sourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
  };
  walk(root);
  return out;
}

/** Split a select list on its top-level commas, respecting nested embeds. */
function splitTopLevel(select) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of select) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * Every embed in a select list, recursing so a nested `jobs(quotations(...))`
 * is reported as `jobs > quotations` rather than against the root table.
 */
function embedsIn(select, table, path = []) {
  const found = [];
  for (const part of splitTopLevel(select)) {
    const open = part.indexOf("(");
    const close = part.lastIndexOf(")");
    if (open === -1 || close < open) continue;

    let head = part.slice(0, open).trim();
    // `alias:target` -- an alias never names a constraint.
    const colon = head.lastIndexOf(":");
    if (colon !== -1) head = head.slice(colon + 1).trim();

    const [target, ...modifiers] = head.split("!").map((piece) => piece.trim());
    if (!target) continue;

    const hint = modifiers.find((m) => !JOIN_MODIFIERS.has(m)) ?? null;
    found.push({ child: table, parent: target, hint, path: [...path, target] });
    found.push(...embedsIn(part.slice(open + 1, close), target, [...path, target]));
  }
  return found;
}

const FROM_RE = /\.from\(\s*(["'`])([A-Za-z0-9_]+)\1\s*\)/g;
const SELECT_RE = /\.select\(\s*(["'`])([\s\S]*?)\1/g;

/** Pair each `.select(...)` with the `.from("table")` that governs it. */
export function queriesIn(text) {
  const froms = [...text.matchAll(FROM_RE)].map((m) => ({ index: m.index, table: m[2] }));
  const out = [];
  for (const match of text.matchAll(SELECT_RE)) {
    const governing = froms.filter((f) => f.index < match.index).pop();
    if (!governing) continue;
    out.push({
      table: governing.table,
      select: match[2].replace(/\s+/g, " ").trim(),
      line: text.slice(0, match.index).split("\n").length,
    });
  }
  return out;
}

function violationsIn(text, pairs, label) {
  const out = [];
  for (const query of queriesIn(text)) {
    for (const embed of embedsIn(query.select, query.table)) {
      if (embed.hint) continue;
      // PostgREST resolves an embed in either direction: `vehicles` embedding
      // `customers` walks the foreign key forwards (many-to-one) and
      // `customers` embedding `vehicles` walks the same keys backwards
      // (one-to-many). Both are ambiguous when the pair carries more than one.
      const forward = pairs.get(`${embed.child}>${embed.parent}`);
      const reverse = pairs.get(`${embed.parent}>${embed.child}`);
      const candidates = forward ?? reverse;
      if (!candidates) continue;
      out.push({
        file: label,
        line: query.line,
        path: embed.path.join(" > "),
        child: embed.child,
        parent: embed.parent,
        direction: forward ? "many-to-one" : "one-to-many",
        candidates,
      });
    }
  }
  return out;
}

function scanRepository(pairs) {
  const files = sourceFiles(SOURCE_ROOT);
  const violations = [];
  for (const file of files) {
    violations.push(
      ...violationsIn(readFileSync(file, "utf8"), pairs, relative(APP, file)),
    );
  }
  return { files, violations };
}

// ---------------------------------------------------------------------------
// Positive control
// ---------------------------------------------------------------------------
function selfTest() {
  // A fixed pair set, so the control tests the detector rather than the schema.
  const pairs = new Map([
    ["vehicles>customers", ["vehicles_customer_id_fkey", "vehicles_customer_id_tenant_fkey"]],
    ["jobs>vehicles", ["jobs_vehicle_id_fkey", "jobs_vehicle_id_tenant_fkey"]],
  ]);

  const cases = [
    ["unhinted embed is caught", `supabase.from("vehicles").select("id, customers(full_name)")`, 1],
    ["reverse one-to-many embed is caught",
      `supabase.from("customers").select("id, vehicles(make, model)")`, 1],
    ["hinted reverse embed passes",
      `supabase.from("customers").select("id, vehicles!vehicles_customer_id_fkey(make)")`, 0],
    ["aliased unhinted embed is caught", `supabase.from("vehicles").select("id, owner:customers(full_name)")`, 1],
    ["nested unhinted embed is caught",
      `supabase.from("jobs").select("id, vehicles!jobs_vehicle_id_fkey(id, customers(full_name))")`, 1],
    ["!inner is not mistaken for a hint", `supabase.from("vehicles").select("id, customers!inner(full_name)")`, 1],
    ["hinted embed passes", `supabase.from("vehicles").select("id, customers!vehicles_customer_id_fkey(x)")`, 0],
    ["hint plus !inner passes",
      `supabase.from("vehicles").select("id, customers!vehicles_customer_id_fkey!inner(x)")`, 0],
    ["unambiguous pair passes", `supabase.from("vehicles").select("id, businesses(name)")`, 0],
    ["embed-free select passes", `supabase.from("vehicles").select("id, make, model")`, 0],
  ];

  let failed = 0;
  for (const [name, fixture, expected] of cases) {
    const got = violationsIn(fixture, pairs, "<fixture>").length;
    const ok = got === expected;
    if (!ok) failed += 1;
    process.stdout.write(`${ok ? "ok  " : "FAIL"} ${name} (expected ${expected}, got ${got})\n`);
  }

  if (failed > 0) {
    process.stdout.write(`EMBED_AUDIT_SELF_TEST_FAILED (${failed} case(s))\n`);
    process.exit(1);
  }
  process.stdout.write("EMBED_AUDIT_SELF_TEST_OK\n");
}

// ---------------------------------------------------------------------------
// Imported by probe-postgrest-embeds.mjs for `queriesIn`; only the direct
// invocation runs the audit.
const invokedDirectly = resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);

if (!invokedDirectly) {
  // nothing to do -- the module only exports its parser
} else if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  let pairs;
  try {
    pairs = ambiguousPairs();
  } catch (err) {
    process.stderr.write(
      `cannot reach ${DB} in ${CONTAINER}. Run: node scripts/db-test.mjs --reset\n` +
        `${err.stderr || ""}`,
    );
    process.stdout.write("POSTGREST_EMBED_AUDIT_UNAVAILABLE\n");
    process.exit(1);
  }

  if (pairs.size === 0) {
    // No ambiguous pairs would make this gate pass without proving anything:
    // migration 0039 creates well over a hundred of them.
    process.stderr.write(
      "no multi-foreign-key relationships found -- the audit query or the " +
        "migrated schema is wrong, not the app\n",
    );
    process.stdout.write("POSTGREST_EMBED_AUDIT_FAILED\n");
    process.exit(1);
  }

  const { files, violations } = scanRepository(pairs);
  process.stdout.write(
    `files=${files.length} ambiguous_pairs=${pairs.size} violations=${violations.length}\n`,
  );

  if (violations.length) {
    process.stdout.write("Embeds that will fail with PGRST201:\n");
    for (const v of violations) {
      process.stdout.write(
        `  - ${v.file}:${v.line}  ${v.path} (${v.direction}) -- name one of: ` +
          `${v.candidates.join(", ")}\n`,
      );
    }
    process.stdout.write("POSTGREST_EMBED_AUDIT_FAILED\n");
    process.exit(1);
  }

  process.stdout.write("POSTGREST_EMBED_AUDIT_OK\n");
}
