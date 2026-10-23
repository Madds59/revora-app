#!/usr/bin/env node
// An audit nobody runs is not a guard.
//
// The PGRST201 outage reached production because no standing check looked at
// what PostgREST would do with the app's selects. audit-postgrest-embeds.mjs
// closes that, but only while it stays part of the suite the project actually
// runs. This asserts the wiring, so deleting it from test:db:all fails a gate
// instead of passing quietly.
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
];

const problems = [];
for (const [name, what] of required) {
  if (!scripts[name]) problems.push(`package.json has no "${name}" script (${what})`);
}
if (!(scripts["test:db:all"] ?? "").includes("audit:embeds")) {
  problems.push('test:db:all does not run audit:embeds, so nothing guards the embeds');
}

if (problems.length) {
  for (const p of problems) process.stdout.write(`  - ${p}\n`);
  process.stdout.write("AUDIT_WIRING_FAILED\n");
  process.exit(1);
}

process.stdout.write(`checks_wired=${required.length} in_suite=test:db:all\n`);
process.stdout.write("AUDIT_WIRING_OK\n");
