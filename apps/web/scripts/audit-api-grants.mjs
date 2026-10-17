#!/usr/bin/env node
// APPSEC-21: the PostgREST roles must not hold table privileges that RLS
// cannot govern.
//
// TRUNCATE is checked before any policy runs, so a role holding it can erase a
// table it cannot read a single row of. TRIGGER and REFERENCES are escalation
// primitives the product never needs. SELECT/INSERT/UPDATE/DELETE are the
// privileges RLS *does* govern and are expected to be present.
//
// Measured from the live catalog rather than from the migration text, because
// `alter default privileges` means a table created later can acquire these
// without any migration mentioning them.
import { execFileSync } from "node:child_process";

const CONTAINER = process.env.REVORA_DB_CONTAINER || "supabase_db_Revora-app";
const DB = process.env.REVORA_TEST_DB || "revora_sec_test";
const FORBIDDEN = ["TRUNCATE", "TRIGGER", "REFERENCES"];

const SQL = `
select g.grantee, g.privilege_type, count(*)::text
from information_schema.role_table_grants g
join pg_class c on c.relname = g.table_name
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where g.table_schema = 'public'
  and g.grantee in ('anon', 'authenticated')
  and g.privilege_type in (${FORBIDDEN.map((p) => `'${p}'`).join(", ")})
group by 1, 2
order by 1, 2;`;

// Sanity query: if the roles hold NO privileges at all the gate would pass
// vacuously -- that would mean the API is broken, not that it is secure.
const SANITY = `
select count(*)::text
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'authenticated'
  and privilege_type = 'SELECT';`;

const psql = (sql) =>
  execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", DB,
      "-X", "-q", "-t", "-A", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8" },
  ).trim();

let rows, selectable;
try {
  rows = psql(SQL).split("\n").filter(Boolean);
  selectable = Number(psql(SANITY));
} catch (err) {
  process.stderr.write(
    `cannot reach ${DB} in ${CONTAINER}. Run: node scripts/db-test.mjs --reset\n` +
      `${err.stderr || ""}`,
  );
  process.stdout.write("API_GRANTS_UNAVAILABLE\n");
  process.exit(1);
}

if (!selectable) {
  process.stderr.write(
    "authenticated holds SELECT on no public table -- the schema is not loaded, " +
      "so this gate would pass without proving anything\n",
  );
  process.stdout.write("API_GRANTS_FAILED\n");
  process.exit(1);
}

process.stdout.write(
  `selectable_tables=${selectable} forbidden_grants=${rows.length}\n`,
);

if (rows.length) {
  process.stdout.write(
    "Privileges RLS cannot govern, still granted:\n" +
      rows.map((r) => {
        const [grantee, priv, count] = r.split("\t");
        return `  - ${grantee}: ${priv} on ${count} table(s)`;
      }).join("\n") + "\n",
  );
  process.stdout.write("API_GRANTS_FAILED\n");
  process.exit(1);
}

process.stdout.write("API_GRANTS_OK\n");
