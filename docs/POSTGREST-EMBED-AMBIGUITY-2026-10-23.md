# PostgREST embed ambiguity (PGRST201) — 2026-10-23

A production outage across most of the dashboard and the whole customer
portal, caused by a correct integrity migration and hidden by a common
JavaScript idiom. Nothing was wrong with the data, the policies or the
permissions.

## What happened

Migration `0039_cross_tenant_parent_integrity.sql` (and `0043` for the tables
it adds) gives every tenant-owned parent/child reference a **composite**
foreign key `(fk_column, business_id) -> parent (id, business_id)` alongside
the original single-column one. That is the right call, and
`pnpm audit:tenant-fks` exists to enforce it: an RLS policy is skipped for
table owners, for `BYPASSRLS` roles and inside `SECURITY DEFINER` functions,
so cross-tenant integrity has to be structural.

PostgREST builds its embed graph from `pg_constraint`. Two foreign keys
between the same table pair make an embed ambiguous:

```ts
supabase.from("vehicles").select("id, customers(full_name)")
```

```
HTTP 300  PGRST201
Could not embed because more than one relationship was found for 'vehicles' and 'customers'
  vehicles_customer_id_fkey         using vehicles(customer_id)              and customers(id)
  vehicles_customer_id_tenant_fkey  using vehicles(customer_id, business_id) and customers(id, business_id)
```

Resolution happens while the request is parsed — **before** row-level security
is evaluated — so it fails identically for every user, returns no rows, and is
invisible from inside the database. 111 relationship pairs became ambiguous;
53 embeds across 29 files were hitting them.

## Why nobody saw it

Three things lined up.

1. **The local stack was behind.** The dev database carries none of 0039's
   composite keys, so every one of these queries works locally and fails in
   production. Any check pointed at localhost passes while proving nothing.
2. **The error was discarded.** The inspections start page read
   `const { data } = await supabase...` and fed `data ?? []` into an empty
   state, so an HTTP 300 rendered as *"Add a vehicle for this customer
   first."* on a business with three vehicles. The screen accused the user of
   having no data and logged nothing. `quotations/new` had the same shape.
   Pages that do check `error` (quotations, invoices, vehicles) showed an
   error state instead — a different symptom from the same cause.
3. **Nothing tested what PostgREST would do.** The schema audits check the
   database; the test suite checks the app; neither checked the request the
   app sends to the API between them.

## The fix

Every embed names its constraint:

```ts
supabase.from("vehicles").select("id, customers!vehicles_customer_id_fkey(full_name)")
```

For 21 of the 22 affected relationships the two constraints cover the same
column and differ only by the `_tenant_fkey` suffix, so the plain one is the
canonical choice. One needed judgement: `business_members` has two foreign
keys to `profiles` on *different* columns (`invited_by`, `user_id`), and the
team list renders the member's own name, so it takes
`business_members_user_id_fkey`. That embed has been ambiguous since
`invited_by` was added, independently of 0039.

`unwrapRows()` / `unwrapRow()` (`src/lib/supabase/unwrap.js`) make the second
failure impossible to write by accident: a failed result raises, so the
route's `error.tsx` boundary renders instead of an empty state.

## The guards

| Command | What it proves |
| --- | --- |
| `pnpm audit:embeds` | No embed in `apps/web/src` crosses a multi-foreign-key pair without naming a constraint. Reads the pairs from the migrated `revora_sec_test`, so a migration that adds a foreign key later fails this automatically. Runs inside `pnpm test:db:all`. |
| `pnpm audit:embeds:self-test` | The detector catches an unhinted embed, a reverse one-to-many embed, an aliased one, a nested one and `!inner` mistaken for a hint — and clears hinted and embed-free selects. |
| `pnpm probe:embeds` | Sends every distinct embed the app issues to a real PostgREST and reads the answer, so a constraint name that is merely plausible is caught (a wrong one returns PGRST200). |

`probe:embeds` starts with a **positive control**: a deliberately unhinted
embed that must come back PGRST201. Against the local stack it does not, so
the probe reports `EMBED_PROBE_UNAVAILABLE` and refuses to certify rather than
passing against a schema that cannot fail. Point it at the deployed database:

```bash
REVORA_PROBE_URL=https://<ref>.supabase.co \
REVORA_PROBE_ANON_KEY=<anon key> \
pnpm probe:embeds
```

The control earned its place twice: the probe found a reverse one-to-many
embed (`customers` embedding `vehicles` in `quotations/new`) that the first
version of the static audit missed entirely, because that audit only looked
at embeds in the many-to-one direction.

## Open decision for the owner

The app-side fix is complete and reversible. The alternative is schema-side:
drop the now-redundant single-column foreign keys, leaving only the composite
ones, which makes every embed unambiguous again with no hints at all. That
would be a large production migration with different `ON DELETE` behaviour,
and it is not something to do without a deliberate decision. Not done here.

## Related

- `apps/web/scripts/audit-tenant-fks.mjs` — the audit that requires the
  composite keys this one has to work around.
- `docs/RLS-TRAP-AUDIT-2026-10-20.md` — the same shape of problem: a database
  change that is correct in SQL and wrong through the API layer.
