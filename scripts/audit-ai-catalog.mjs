#!/usr/bin/env node
/**
 * Verifies that the AI automation catalog cites only things that exist.
 *
 * The catalog's whole value is that each automation names the real table,
 * route and helper it would hook into. A fabricated table name turns the
 * document into a plausible-sounding listicle, so every citation is checked
 * against the migrations and the app tree.
 *
 * Citation grammar in the doc:
 *   `public.jobs`            -> must exist in supabase/migrations
 *   `public.leads` (new)     -> proposed; must NOT already exist
 *   `/jobs`                  -> must resolve to a route file
 *   `/api/inbound/meta` (new)-> proposed; must NOT already exist
 *   `callOpenAiJson()`       -> symbol; must exist in apps/web/src
 *
 * --self-test runs the checks against fixtures where the answer is known,
 * including citations that MUST be caught. A checker that cannot fail proves
 * nothing, so G1 is the positive control for every other gate here.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const APP = join(ROOT, "apps", "web", "src", "app");
const SRC = join(ROOT, "apps", "web", "src");

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Every table name created by a migration. */
export function existingTables(migrationsDir = MIGRATIONS) {
  const tables = new Set();
  for (const file of walk(migrationsDir)) {
    if (!file.endsWith(".sql")) continue;
    const sql = readFileSync(file, "utf8");
    const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi;
    let m;
    while ((m = re.exec(sql))) tables.add(m[1].toLowerCase());
  }
  return tables;
}

/**
 * Every route path the app serves, with [locale] and (group) segments
 * stripped, so a doc can cite the user-visible path.
 */
export function existingRoutes(appDir = APP) {
  const routes = new Set();
  for (const file of walk(appDir)) {
    const base = file.split(sep).pop();
    if (base !== "page.tsx" && base !== "route.ts") continue;
    const segments = relative(appDir, file)
      .split(sep)
      .slice(0, -1)
      .filter((s) => s !== "[locale]" && !(s.startsWith("(") && s.endsWith(")")));
    routes.add("/" + segments.join("/"));
    // A dynamic leaf also answers for its collection path.
    if (segments.length) routes.add("/" + segments.slice(0, -1).join("/"));
  }
  routes.add("/");
  return routes;
}

/** Exported or declared symbol names across the app source. */
export function existingSymbols(srcDir = SRC) {
  const symbols = new Set();
  for (const file of walk(srcDir)) {
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    const re = /(?:export\s+(?:async\s+)?function|export\s+const|function|const)\s+([A-Za-z_$][\w$]*)/g;
    let m;
    while ((m = re.exec(text))) symbols.add(m[1]);
  }
  return symbols;
}

const CITE = {
  table: /`public\.([a-z_][a-z0-9_]*)`(\s*\(new\))?/g,
  route: /`(\/[A-Za-z0-9_\-/\[\]]*)`(\s*\(new\))?/g,
  symbol: /`([A-Za-z_$][\w$]*)\(\)`(\s*\(new\))?/g,
};

export function auditText(text, { tables, routes, symbols }) {
  const violations = [];
  const counts = { table: 0, route: 0, symbol: 0, proposed: 0 };

  const check = (kind, re, exists, label) => {
    let m;
    while ((m = re.exec(text))) {
      const name = m[1];
      const isNew = Boolean(m[2]);
      counts[kind] += 1;
      if (isNew) counts.proposed += 1;
      const present = exists(name);
      if (isNew && present) {
        violations.push(`${label} \`${name}\` is marked (new) but already exists.`);
      } else if (!isNew && !present) {
        violations.push(`${label} \`${name}\` is cited as existing but was not found.`);
      }
    }
  };

  check("table", new RegExp(CITE.table.source, "g"), (n) => tables.has(n), "table");
  check("route", new RegExp(CITE.route.source, "g"), (n) => routes.has(n.replace(/\/$/, "") || "/"), "route");
  check("symbol", new RegExp(CITE.symbol.source, "g"), (n) => symbols.has(n), "symbol");

  return { violations, counts };
}

/** Lifecycle stages the catalog must cover, in journey order. */
export const REQUIRED_STAGES = [
  "Stage 0", "Stage 1", "Stage 2", "Stage 3", "Stage 4", "Stage 5",
  "Stage 6", "Stage 7", "Stage 8", "Stage 9", "Stage 10", "Stage 11", "Stage 12",
];

export function auditCoverage(text) {
  const missing = REQUIRED_STAGES.filter((s) => !new RegExp(`##\\s+${s}\\b`).test(text));
  const entries = (text.match(/^###\s+A\d+\./gm) ?? []).length;
  return { missing, entries };
}

function selfTest() {
  const tables = new Set(["jobs", "customers"]);
  const routes = new Set(["/jobs", "/api/stripe/webhook"]);
  const symbols = new Set(["callOpenAiJson"]);
  const env = { tables, routes, symbols };

  const cases = [
    // [label, text, mustBeCaught]
    ["fabricated table", "hooks `public.nonexistent_table` here", true],
    ["proposed table that already exists", "adds `public.jobs` (new)", true],
    ["fabricated route", "posts to `/api/does/not/exist`", true],
    ["fabricated symbol", "calls `noSuchHelper()`", true],
    ["real table", "reads `public.jobs`", false],
    ["honestly proposed table", "adds `public.leads` (new)", false],
    ["real route", "serves `/jobs`", false],
    ["real symbol", "calls `callOpenAiJson()`", false],
  ];

  let failures = 0;
  for (const [label, text, mustBeCaught] of cases) {
    const { violations } = auditText(text, env);
    const caught = violations.length > 0;
    if (caught !== mustBeCaught) {
      console.error(`SELF-TEST FAIL: ${label} -> caught=${caught}, expected=${mustBeCaught}`);
      failures += 1;
    }
  }

  // Coverage must notice a missing stage.
  const short = "## Stage 0\n## Stage 1\n";
  if (auditCoverage(short).missing.length === 0) {
    console.error("SELF-TEST FAIL: coverage check did not notice missing stages");
    failures += 1;
  }
  const full = REQUIRED_STAGES.map((s) => `## ${s}`).join("\n");
  if (auditCoverage(full).missing.length !== 0) {
    console.error("SELF-TEST FAIL: coverage check rejected a complete document");
    failures += 1;
  }

  console.log(`self-test cases=${cases.length + 2} failures=${failures}`);
  if (failures) process.exit(1);
  console.log("AI_CATALOG_AUDIT_SELF_TEST_OK");
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) return selfTest();

  const target = args.find((a) => !a.startsWith("--")) ?? "docs/ai-automation/AI_AUTOMATION_CATALOG.md";
  const text = readFileSync(join(ROOT, target), "utf8");
  const env = { tables: existingTables(), routes: existingRoutes(), symbols: existingSymbols() };

  const { violations, counts } = auditText(text, env);
  const coverage = auditCoverage(text);

  console.log(
    `tables_cited=${counts.table} routes_cited=${counts.route} symbols_cited=${counts.symbol} ` +
      `proposed=${counts.proposed} schema_tables=${env.tables.size} app_routes=${env.routes.size} ` +
      `entries=${coverage.entries} stages_missing=${coverage.missing.length}`,
  );

  if (args.includes("--coverage")) {
    if (coverage.missing.length) {
      console.error("Missing stages: " + coverage.missing.join(", "));
      process.exit(1);
    }
    if (coverage.entries < 40) {
      console.error(`Only ${coverage.entries} catalog entries; expected at least 40.`);
      process.exit(1);
    }
    console.log("AI_CATALOG_COVERAGE_OK");
    return;
  }

  if (violations.length) {
    for (const v of violations) console.error("VIOLATION: " + v);
    console.error(`violations=${violations.length}`);
    process.exit(1);
  }
  console.log("AI_CATALOG_AUDIT_OK");
}

main();
