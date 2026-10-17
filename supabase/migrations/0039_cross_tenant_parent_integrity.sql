-- ===========================================================================
-- Cross-tenant parent/child integrity for the Phase 1 trusted record.
--
-- THE BUG (APPSEC-18)
-- Every tenant-owned child table carries its own `business_id` AND a foreign
-- key to a parent row, and the client supplies both. PostgreSQL validates
-- foreign keys with RLS BYPASSED, so an FK aimed at another tenant's row
-- satisfies referential integrity happily. The RLS policies written in 0002
-- only ever inspect the row's own `business_id`:
--
--     create policy "quotation_items_manage_managers" on public.quotation_items
--       for all using (public.has_business_role(business_id, ...))
--       with check (public.has_business_role(business_id, ...));
--
-- Nothing proves `quotation_items.business_id = quotations.business_id`. And
-- 0003_api_grants.sql grants INSERT on every public table to `authenticated`,
-- so PostgREST is a reachable write path for anyone holding a session --
-- the hardened server actions are not the only door.
--
-- PROVEN, not theorised. Against a real database at schema 0038, every one of
-- these was ACCEPTED (supabase/tests/tenant_parent_integrity_tests.sql):
--
--   * a portal customer of tenant A inserted an approval over tenant B's
--     quotation; handle_quote_approved() (SECURITY DEFINER, 0015) then flipped
--     B's quotation to `approved` and created a job inside tenant B;
--   * a manager of A attached a line item, and a revision, to B's quotation;
--   * staff of A attached evidence to B's complaint;
--   * staff of A wrote into B's customer-visible job feed.
--
-- The read asymmetry is what makes this class so hard to notice: a row with
-- business_id = A hanging off B's quotation is visible to A's staff and to B's
-- CUSTOMER (the `*_access` policies reach the customer through the parent), but
-- invisible to B's own staff. The victim tenant cannot see what was planted.
--
-- 0035_tenant_isolation_hardening.sql fixed this class for the tables
-- introduced in 0034 by adding parent-tenant predicates to their policies.
-- This migration covers the original 0001/0002 trusted-record spine, and
-- prefers a structural guarantee over a policy one.
--
-- THE FIX, in three layers (Rule E -- defence in depth)
--
--   1. STRUCTURAL. A composite foreign key (parent_id, business_id) ->
--      parent (id, business_id). This is strictly stronger than any policy:
--      referential integrity is enforced on EVERY write path, including RPC,
--      trigger, service_role and future migrations, and RLS is not consulted.
--      MATCH SIMPLE means a NULL parent_id is still "no reference to
--      validate", so optional links keep working.
--
--   2. POLICY. Parent-tenant predicates on the INSERT/UPDATE policies of the
--      five proven tables, reusing the helpers 0035 already established. If a
--      constraint were ever dropped, the policies still refuse.
--
--   3. PRIVILEGED CODE. handle_quote_approved() validates its own invariant
--      and fails closed, instead of trusting the quotation_id it is handed.
--
-- FORWARD-ONLY. Adds constraints and replaces policies/functions; drops no
-- column and deletes no row.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The relation set, as a function so the census, the constraint builder and
-- the CI audit all read from one definition instead of three copies that can
-- drift apart.
--
-- A relation qualifies when: child and parent are both ordinary tables in
-- `public` carrying a business_id column; the FK is single-column (a composite
-- FK is already the fix); and parent is not `businesses` (that reference is
-- the tenancy anchor) and not the child itself.
-- ---------------------------------------------------------------------------
create or replace function public.tenant_parent_child_relations()
returns table (child text, fk_column text, parent text)
language sql
stable
set search_path = public
as $$
  with tenant_tables as (
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'business_id'
      and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
  )
  select ch.relname::text,
         (select att.attname
            from pg_attribute att
           where att.attrelid = con.conrelid
             and att.attnum = con.conkey[1])::text,
         pa.relname::text
  from pg_constraint con
  join tenant_tables ch on ch.oid = con.conrelid
  join tenant_tables pa on pa.oid = con.confrelid
  where con.contype = 'f'
    and array_length(con.conkey, 1) = 1
    and pa.relname <> 'businesses'
    and ch.relname <> pa.relname
$$;

comment on function public.tenant_parent_child_relations() is
  'Enumerates every tenant-owned parent/child reference that must satisfy child.business_id = parent.business_id (APPSEC-18). Single source of truth for the census, the composite-FK builder and the CI audit.';

-- ---------------------------------------------------------------------------
-- 0-2. Universal tenant parent/child integrity, derived from the catalog.
--
-- WHY CATALOG-DRIVEN RATHER THAN A HAND-WRITTEN LIST
-- A fixed list of relations is wrong the moment someone adds a table, and this
-- schema has 84 tenant parent/child references across Phase 1 and the Vehicle
-- Intelligence work. Enumerating them here means the invariant is stated once,
-- as a rule, and a table added later inherits it instead of quietly
-- reintroducing the class.
--
-- THE RULE
-- For every table in `public` that has a `business_id` column and a
-- single-column foreign key to another table that also has a `business_id`
-- column, require that the two agree -- by adding a composite foreign key
-- (fk_column, business_id) -> parent (id, business_id).
--
-- `businesses` itself is excluded (the business_id -> businesses reference is
-- the tenancy anchor, not a parent/child relation), as are self-references.
--
-- Nothing is excluded beyond that. A tenant-owned row hanging off another
-- tenant's row is never legitimate in this product, so the invariant is
-- universal rather than a judgement call per table.
-- ---------------------------------------------------------------------------

-- Step 0: violation census.
--
-- A composite FK cannot be added over data that already violates it. Rule 4.6
-- requires measuring first and never silently deleting, so this fails LOUDLY
-- and names every offending relation rather than discarding rows or quietly
-- skipping a constraint. The migration is one transaction, so a failure here
-- leaves the schema exactly as it was.
--
-- If this raises, those rows are genuine cross-tenant corruption and need an
-- explicit, reviewed decision -- see docs/security/MIGRATION_RELEASE_SOP.md.
do $census$
declare
  rel record;
  violations bigint;
  report text := '';
  total bigint := 0;
begin
  for rel in select * from public.tenant_parent_child_relations() loop
    execute format(
      'select count(*) from public.%I c join public.%I p on p.id = c.%I
         where c.%I is not null and c.business_id is not null
           and p.business_id is distinct from c.business_id',
      rel.child, rel.parent, rel.fk_column, rel.fk_column
    ) into violations;

    if violations > 0 then
      total := total + violations;
      report := report || format(
        E'\n  %s.%s -> %s: %s row(s)', rel.child, rel.fk_column, rel.parent, violations
      );
    end if;
  end loop;

  if total > 0 then
    raise exception
      E'Cross-tenant parent/child violations present; refusing to add integrity constraints over corrupt data.%s\nTotal: % row(s). These rows are evidence of the APPSEC-18 class and must be reviewed, not deleted silently.',
      report, total;
  end if;

  raise notice 'APPSEC-18 census clean across % relation(s).',
    (select count(*) from public.tenant_parent_child_relations());
end
$census$;

-- Step 1: parent uniqueness.
--
-- A composite FK requires the referenced columns to be provably unique.
-- (id) is already the primary key, so (id, business_id) is logically
-- redundant -- but declaring it is what lets a child FK name business_id at
-- all. It also pins a parent's tenancy: business_id can no longer be edited
-- out from under children that reference it.
do $parents$
declare
  p text;
  cname text;
begin
  for p in
    select distinct parent from public.tenant_parent_child_relations()
  loop
    cname := left(p || '_id_business_id_key', 63);
    if not exists (
      select 1 from pg_constraint
      where conrelid = ('public.' || p)::regclass and conname = cname
    ) then
      execute format(
        'alter table public.%I add constraint %I unique (id, business_id)', p, cname
      );
    end if;
  end loop;
end
$parents$;

-- Step 2: composite foreign keys.
--
-- Added ALONGSIDE the existing single-column FKs, which keep their ON DELETE
-- behaviour. A parent delete that cascades removes the child (satisfying both
-- constraints); one that sets the column NULL satisfies this constraint by
-- MATCH SIMPLE, which treats a NULL reference as "nothing to validate".
-- ON UPDATE CASCADE keeps a tenant re-key, should a migration ever perform
-- one, from stranding children.
--
-- After this, `child.business_id <> parent.business_id` is not a policy
-- question. It is unrepresentable.
do $children$
declare
  rel record;
  cname text;
begin
  for rel in select * from public.tenant_parent_child_relations() loop
    cname := left(rel.child || '_' || rel.fk_column || '_tenant_fkey', 63);
    if not exists (
      select 1 from pg_constraint
      where conrelid = ('public.' || rel.child)::regclass and conname = cname
    ) then
      execute format(
        'alter table public.%I add constraint %I
           foreign key (%I, business_id)
           references public.%I (id, business_id)
           on update cascade',
        rel.child, cname, rel.fk_column, rel.parent
      );
      -- The single-column FK index does not serve a two-column check, and the
      -- check runs on every parent update.
      execute format(
        'create index if not exists %I on public.%I (%I, business_id)',
        left(rel.child || '_' || rel.fk_column || '_tenant_idx', 63),
        rel.child, rel.fk_column
      );
    end if;
  end loop;
end
$children$;

-- ---------------------------------------------------------------------------
-- 3. Policy layer (defence in depth).
--
-- The constraints above already make these writes impossible. The policies are
-- restated anyway so that the authorization rule is legible where a reviewer
-- looks for it, and so the boundary survives a future constraint change.
--
-- `complaint_in_business` completes the helper set 0035 started.
-- ---------------------------------------------------------------------------
create or replace function public.complaint_in_business(
  target_complaint_id uuid,
  target_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_complaint_id is null or exists (
    select 1 from public.complaints c
    where c.id = target_complaint_id and c.business_id = target_business_id
  );
$$;

comment on function public.complaint_in_business(uuid, uuid) is
  'True when the complaint belongs to the business (or the id is NULL). Used by complaint-child RLS policies to prove parent tenancy.';

-- approvals: a customer may only approve a quotation that is theirs, in their
-- tenant. The quotation's own tenancy is now proven, not assumed.
drop policy if exists "approvals_customer_insert" on public.approvals;
create policy "approvals_customer_insert" on public.approvals
  for insert with check (
    public.is_customer_for_business(business_id, customer_id)
    and public.quotation_in_business(quotation_id, business_id)
    and exists (
      select 1 from public.quotations q
      where q.id = quotation_id
        and q.business_id = business_id
        and q.customer_id = customer_id
    )
  );

-- quotation_items: manager write access, now scoped to their own quotations.
drop policy if exists "quotation_items_manage_managers" on public.quotation_items;
create policy "quotation_items_manage_managers" on public.quotation_items
  for all
  using (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
    and public.quotation_in_business(quotation_id, business_id)
  )
  with check (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
    and public.quotation_in_business(quotation_id, business_id)
  );

drop policy if exists "quotation_revisions_staff_insert" on public.quotation_revisions;
create policy "quotation_revisions_staff_insert" on public.quotation_revisions
  for insert with check (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
    and public.quotation_in_business(quotation_id, business_id)
  );

drop policy if exists "job_updates_staff_insert" on public.job_updates;
create policy "job_updates_staff_insert" on public.job_updates
  for insert with check (
    public.is_business_member(business_id)
    and public.job_in_business(job_id, business_id)
  );

drop policy if exists "complaint_evidence_insert_participants" on public.complaint_evidence;
create policy "complaint_evidence_insert_participants" on public.complaint_evidence
  for insert with check (
    public.complaint_in_business(complaint_id, business_id)
    and (
      public.is_business_member(business_id)
      or exists (
        select 1
        from public.complaints c
        where c.id = complaint_id
          and public.is_customer_for_business(c.business_id, c.customer_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4. The privileged trigger validates its own invariant.
--
-- The original loaded the quotation from new.quotation_id alone and mutated it
-- with RLS off. Even with the constraints above making a mismatched approval
-- unrepresentable, a SECURITY DEFINER function that performs privileged
-- mutations must not rely on its caller having been filtered (Rule D): it is
-- reachable from service_role and from any future server-side path.
--
-- It now fails CLOSED. Note the change in failure mode: the original returned
-- NEW on a missing quotation, silently accepting an approval that referenced
-- nothing. That row cannot exist any more (the FK forbids it), so refusing is
-- the correct response to an impossible state.
-- ---------------------------------------------------------------------------
create or replace function public.handle_quote_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.quotations%rowtype;
  new_job_id uuid;
begin
  select * into q from public.quotations where id = new.quotation_id;
  if not found then
    raise exception 'approval % references a quotation that does not exist', new.quotation_id
      using errcode = '23503';
  end if;

  -- The invariant this function depends on, checked here rather than assumed.
  if q.business_id is distinct from new.business_id then
    raise exception
      'approval tenant mismatch: approval.business_id=% but quotation %  belongs to %',
      new.business_id, q.id, q.business_id
      using errcode = '42501';
  end if;

  if q.customer_id is distinct from new.customer_id then
    raise exception
      'approval customer mismatch: approval.customer_id=% but quotation % belongs to customer %',
      new.customer_id, q.id, q.customer_id
      using errcode = '42501';
  end if;

  -- Authoritative status flip. Unchanged: only a sent/revised quote advances.
  update public.quotations
    set status = 'approved'
    where id = q.id
      and status in ('sent', 'revised');

  -- Create the job once per quotation.
  if not exists (
    select 1 from public.jobs where quotation_id = q.id
  ) then
    insert into public.jobs (
      business_id, quotation_id, customer_id, branch_id,
      status, title, expected_completion_at, created_by
    )
    values (
      q.business_id, q.id, q.customer_id, q.branch_id,
      'approved',
      'Work for ' || q.quote_number,
      case
        when q.expected_completion_date is not null
        then q.expected_completion_date::timestamptz
        else null
      end,
      q.created_by
    )
    returning id into new_job_id;

    insert into public.job_updates (
      business_id, job_id, status, message, visible_to_customer, created_by
    )
    values (
      q.business_id, new_job_id, 'approved',
      'Job created from approved quotation ' || q.quote_number,
      true, q.created_by
    );
  end if;

  return new;
end;
$$;

comment on function public.handle_quote_approved() is
  'Drives the quote-approved side effects. Validates approval/quotation tenant and customer agreement before any privileged mutation (APPSEC-18); fails closed.';
