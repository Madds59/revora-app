#!/usr/bin/env node
// Systematic audit for the APPSEC-18 class.
//
// INVARIANT: for every tenant-owned parent/child reference in the schema,
// child.business_id must equal parent.business_id, and that must be guaranteed
// structurally -- by a composite foreign key (fk_column, business_id) ->
// parent (id, business_id) -- not merely by an RLS policy, which is skipped for
// table owners, for BYPASSRLS roles and inside SECURITY DEFINER functions.
//
// The relation set comes from public.tenant_parent_child_relations(), the same
// function migration 0039 drives its constraint builder from, so this audit
// cannot pass by checking a narrower list than the migration covered. A table
// added later appears here automatically and fails the gate until it is
// covered.
import { execFileSync } from "node:child_process";

const CONTAINER = process.env.REVORA_DB_CONTAINER || "supabase_db_Revora-app";
const DB = process.env.REVORA_TEST_DB || "revora_sec_test";

// Left join the required relations against the composite FKs that exist.
const SQL = `
with required as (
  select child, fk_column, parent from public.tenant_parent_child_relations()
),
composite as (
  -- Compare on the relation OID, not on regclass::text: regclass renders as
  -- 'vehicles' when public is on the search_path and as 'public.vehicles' when
  -- it is not, so a text comparison silently matches nothing.
  select con.conrelid as child_oid,
         (select att.attname from pg_attribute att
           where att.attrelid = con.conrelid and att.attnum = con.conkey[1]) as col_a,
         (select att.attname from pg_attribute att
           where att.attrelid = con.conrelid and att.attnum = con.conkey[2]) as col_b
  from pg_constraint con
  where con.contype = 'f' and array_length(con.conkey, 1) = 2
)
select r.child, r.fk_column, r.parent,
       (exists (
          select 1 from composite c
          where c.child_oid = to_regclass('public.' || r.child)
            and ((c.col_a = r.fk_column and c.col_b = 'business_id')
              or (c.col_b = r.fk_column and c.col_a = 'business_id'))
       ))::text as covered
from required r
order by covered, r.child, r.fk_column;`;

let raw;
try {
  raw = execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", DB,
      "-X", "-q", "-t", "-A", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", SQL],
    { encoding: "utf8" },
  );
} catch (err) {
  process.stderr.write(
    `cannot reach ${DB} in ${CONTAINER}. Run: node scripts/db-test.mjs --reset\n` +
      `${err.stderr || ""}`,
  );
  process.stdout.write("TENANT_FK_AUDIT_UNAVAILABLE\n");
  process.exit(1);
}

const rows = raw.split("\n").filter(Boolean).map((l) => {
  const [child, fk, parent, covered] = l.split("\t");
  return { key: `${child}.${fk}->${parent}`, covered: covered === "true" };
});

if (rows.length === 0) {
  // An empty relation set would make this gate pass without proving anything.
  process.stderr.write(
    "no tenant parent/child relations found -- the audit query or schema is wrong\n",
  );
  process.stdout.write("TENANT_FK_AUDIT_FAILED\n");
  process.exit(1);
}

const uncovered = rows.filter((r) => !r.covered);
process.stdout.write(
  `relations=${rows.length} covered=${rows.length - uncovered.length} ` +
    `uncovered=${uncovered.length}\n`,
);

if (uncovered.length) {
  process.stdout.write(
    "Tenant parent/child references WITHOUT a composite guarantee:\n" +
      uncovered.map((r) => `  - ${r.key}`).join("\n") + "\n",
  );
  process.stdout.write("TENANT_FK_AUDIT_FAILED\n");
  process.exit(1);
}

process.stdout.write("TENANT_FK_AUDIT_OK\n");
