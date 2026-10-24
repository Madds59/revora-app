#!/usr/bin/env node
// An audit nobody runs is not a guard.
//
// The PGRST201 outage reached production because no standing check looked at
// what PostgREST would do with the app's selects. audit-postgrest-embeds.mjs
// closes that, but only while it stays part of the suite the project actually
// runs. This asserts the wiring, so deleting it from test:db:all fails a gate
// instead of passing quietly.
//
// It used to read package.json ALONE, which made it certify a guard that CI
// never ran: audit:embeds was wired into test:db:all, and CI invokes the
// individual test:db:* scripts, never test:db:all. So the workflow is checked
// here too -- a script present in package.json but absent from ci.yml is not
// wired, it is only available.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(APP, "package.json"), "utf8"));
const scripts = pkg.scripts ?? {};

const required = [
  ["audit:embeds", "the embed audit"],
  ["audit:embeds:self-test", "its positive control"],
  ["probe:embeds", "the live PostgREST probe"],
  ["audit:discards", "the discarded-query-error audit"],
  ["audit:discards:self-test", "its positive control"],
];

const problems = [];
for (const [name, what] of required) {
  if (!scripts[name]) problems.push(`package.json has no "${name}" script (${what})`);
}
if (!(scripts["test:db:all"] ?? "").includes("audit:embeds")) {
  problems.push('test:db:all does not run audit:embeds, so nothing guards the embeds');
}
// The discard audit is static, so it belongs in the offline suite CI always runs.
for (const name of ["audit:discards", "audit:discards:self-test"]) {
  if (!(scripts.test ?? "").includes(name)) {
    problems.push(`test does not run ${name}, so nothing guards the render paths`);
  }
}

// The embed audit reads the migrated schema, so it cannot live in the offline
// `test` script -- it belongs in the db-security job, which provisions the
// container. Assert it is actually invoked there.
const WORKFLOW = resolve(APP, "../../.github/workflows/ci.yml");
let workflow;
try {
  workflow = readFileSync(WORKFLOW, "utf8");
} catch (err) {
  // A missing workflow is a failure, not a pass: it is the artefact that
  // decides whether any of this runs on a pull request.
  problems.push(`cannot read .github/workflows/ci.yml (${err.code ?? err.message})`);
  workflow = "";
}
const inWorkflow = (name) =>
  // `pnpm -s audit:embeds` must not be satisfied by `audit:embeds:self-test`.
  new RegExp(`pnpm\\s+(?:-s\\s+)?${name.replace(/[:]/g, "[:]")}(?![\\w:-])`).test(workflow);

for (const name of ["audit:embeds", "audit:embeds:self-test"]) {
  if (workflow && !inWorkflow(name)) {
    problems.push(`ci.yml does not run ${name}, so no gate gets to see an unhinted embed`);
  }
}

if (problems.length) {
  for (const p of problems) process.stdout.write(`  - ${p}\n`);
  process.stdout.write("AUDIT_WIRING_FAILED\n");
  process.exit(1);
}

process.stdout.write(
  `checks_wired=${required.length} in_suites=test:db:all,test in_workflow=audit:embeds,audit:embeds:self-test\n`,
);
process.stdout.write("AUDIT_WIRING_OK\n");
