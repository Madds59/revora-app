-- ===========================================================================
-- Phase 1 trusted-record completion (TRUST-01).
--
-- The Phase 1 objective is that one service journey can be reconstructed from
-- customer through complaint resolution. Four links could not be, because the
-- data to make them did not exist:
--
--   VEHICLE -> JOB        `jobs` had no vehicle_id. A completed job could only
--                         be traced to a vehicle via its quotation, and
--                         quotation_id is nullable -- so a job created outside
--                         the quote flow had no vehicle at all.
--   JOB -> PERFORMED WORK `job_tasks` is a checklist (title, is_completed). It
--                         cannot say which part was fitted, how many, or at
--                         what price. Quotation and invoice items record what
--                         was OFFERED and BILLED; nothing recorded what was
--                         actually DONE, so the two could not be compared.
--   WARRANTY              `warranty_terms` exists as free text on products and
--                         quotations. That is wording, not a record: it cannot
--                         answer which vehicle is covered, until when, or
--                         whether the warranty was ever invoked.
--   COMPLAINT -> CONTEXT  `complaints` linked to customer, quotation and job,
--                         but not to the vehicle or the invoice, and had no
--                         category -- so complaints could not be grouped by
--                         what went wrong.
--
-- Also reconciles one piece of production drift, see section A.
--
-- SCOPE. This migration builds the data layer: tables, columns, constraints,
-- RLS, grants, audit coverage and tenant integrity, with the same three-layer
-- treatment as 0039. It does NOT build dashboard or portal UI for warranties
-- and performed work, so those two entities are recorded-but-not-yet-surfaced
-- until that work lands. That is stated plainly rather than implied to be
-- complete.
--
-- FORWARD-ONLY. Adds tables, columns, constraints and triggers; drops no
-- column and deletes no row.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- A. Production drift: the `ensure_rls` event trigger.
--
-- Production carries an event trigger `ensure_rls` running rls_auto_enable(),
-- which enables RLS on every table created in `public`. It exists in the
-- database and in NO migration -- it was applied directly, so a database built
-- from this repo behaves differently from production: there, a new table gets
-- RLS automatically; here it does not. That divergence is worth more than the
-- convenience, because it means a locally-green migration can be less safe in
-- production than it looks, or more.
--
-- Codified here so the repo is the source of truth. Creating an event trigger
-- needs superuser, which the migration role may not have on hosted Supabase --
-- and on production the object already exists -- so failure to create is a
-- NOTICE, not an error.
-- ---------------------------------------------------------------------------
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name = 'public' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception when others then
        raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    end if;
  end loop;
end;
$$;

comment on function public.rls_auto_enable() is
  'Event-trigger function: enables RLS on any table created in public. Mirrors the `ensure_rls` trigger already present in production, which no migration created (TRUST-01).';

do $evt$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    begin
      create event trigger ensure_rls on ddl_command_end
        execute function public.rls_auto_enable();
      raise notice 'TRUST-01: created event trigger ensure_rls.';
    exception when insufficient_privilege then
      raise notice
        'TRUST-01: cannot create event trigger ensure_rls (needs superuser). RLS must be enabled explicitly on new tables, as this migration does.';
    end;
  end if;
end
$evt$;

-- ---------------------------------------------------------------------------
-- B. VEHICLE -> JOB.
--
-- Nullable, because existing jobs cannot all be resolved: a job whose
-- quotation is null, or whose quotation carries no vehicle, has nothing
-- deterministic to point at and guessing would fabricate service history.
-- Backfilled where the quotation does name a vehicle; the rest are reported
-- below and listed by `public.jobs_missing_vehicle` for follow-up.
--
-- NOT NULL is deliberately NOT asserted yet -- that is a staged change for
-- once the legacy rows are resolved and the UI always supplies a vehicle.
-- ---------------------------------------------------------------------------
alter table public.jobs add column if not exists vehicle_id uuid references public.vehicles (id);

update public.jobs j
  set vehicle_id = q.vehicle_id
from public.quotations q
where j.quotation_id = q.id
  and j.vehicle_id is null
  and q.vehicle_id is not null
  and q.business_id = j.business_id;

create index if not exists jobs_vehicle_idx on public.jobs (vehicle_id);

create or replace view public.jobs_missing_vehicle as
  select j.id, j.business_id, j.customer_id, j.quotation_id, j.status, j.created_at
  from public.jobs j
  where j.vehicle_id is null;

comment on view public.jobs_missing_vehicle is
  'Jobs with no vehicle link, for the remediation backlog. A job here cannot be traced to a vehicle, so its service history is incomplete (TRUST-01).';

-- The view inherits the RLS of the underlying table for the querying role.
grant select on public.jobs_missing_vehicle to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- C. DELIVERY / COMPLETION.
--
-- `jobs.status` already has `completed` and `jobs.completed_at` already
-- records when, so no new table is warranted -- only the two facts that were
-- missing: WHO completed it, and whether the vehicle was handed back.
-- ---------------------------------------------------------------------------
alter table public.jobs add column if not exists completed_by uuid references auth.users (id) on delete set null;
alter table public.jobs add column if not exists delivered_at timestamptz;
alter table public.jobs add column if not exists delivered_by uuid references auth.users (id) on delete set null;
alter table public.jobs add column if not exists delivery_notes text;

-- A vehicle cannot be handed back before the work is finished.
alter table public.jobs drop constraint if exists jobs_delivery_after_completion;
alter table public.jobs add constraint jobs_delivery_after_completion
  check (delivered_at is null or completed_at is null or delivered_at >= completed_at) not valid;

comment on column public.jobs.delivered_at is
  'When the vehicle was handed back to the customer. Distinct from completed_at: work can finish before collection (TRUST-01).';

-- ---------------------------------------------------------------------------
-- D. COMPLAINT -> ORIGINATING CONTEXT.
--
-- All three links are nullable: the domain genuinely allows a complaint that
-- is not about a specific vehicle or invoice (a billing dispute, a service
-- complaint about the premises). The point is that a service-related complaint
-- CAN reconstruct its transaction, not that every complaint must.
-- ---------------------------------------------------------------------------
do $cat$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'complaint_category') then
    create type public.complaint_category as enum (
      'workmanship', 'parts', 'pricing', 'delay', 'damage',
      'customer_service', 'warranty', 'other'
    );
  end if;
end
$cat$;

alter table public.complaints add column if not exists vehicle_id uuid references public.vehicles (id);
alter table public.complaints add column if not exists invoice_id uuid references public.invoices (id);
alter table public.complaints add column if not exists category public.complaint_category;

-- Deterministic backfill only: take the vehicle from the complaint's own job
-- or quotation when one is linked. Category is left NULL rather than guessed --
-- inventing a category would corrupt the very grouping it is meant to enable.
update public.complaints c
  set vehicle_id = j.vehicle_id
from public.jobs j
where c.job_id = j.id and c.vehicle_id is null
  and j.vehicle_id is not null and j.business_id = c.business_id;

update public.complaints c
  set vehicle_id = q.vehicle_id
from public.quotations q
where c.quotation_id = q.id and c.vehicle_id is null
  and q.vehicle_id is not null and q.business_id = c.business_id;

create index if not exists complaints_vehicle_idx on public.complaints (vehicle_id);
create index if not exists complaints_invoice_idx on public.complaints (invoice_id);
create index if not exists complaints_category_idx on public.complaints (category);

-- ---------------------------------------------------------------------------
-- E. JOB -> PERFORMED WORK.
--
-- The record of what was ACTUALLY done, which is not the same thing as what
-- was quoted. `source_quotation_item_id` is what makes the two comparable: a
-- performed row with no source was extra work, and a quoted item with no
-- performed row was never carried out. That comparison is the whole reason
-- this table exists, and is why extending quotation_items with a "performed"
-- flag would not do -- quantities and prices diverge, and a quote line can
-- produce several performed lines.
--
-- customer and vehicle are reached through the job rather than duplicated:
-- a second copy is a second thing to get out of step, and 0039's composite
-- foreign keys already pin the job to its tenant.
--
-- `unit_price` only: `products` carries a price and no cost, so recording a
-- cost here would invent a margin model the product does not support.
-- ---------------------------------------------------------------------------
create table if not exists public.job_performed_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  source_quotation_item_id uuid references public.quotation_items (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  kind public.item_kind not null,
  name text not null,
  description text,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  notes text,
  performed_at timestamptz not null default now(),
  performed_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.job_performed_items is
  'Parts and services actually performed on a job, as distinct from quoted (quotation_items) or billed (invoice_items). source_quotation_item_id links back to what was offered, so extra and omitted work are both visible (TRUST-01).';

create index if not exists job_performed_items_job_idx on public.job_performed_items (job_id);
create index if not exists job_performed_items_source_idx on public.job_performed_items (source_quotation_item_id);

-- ---------------------------------------------------------------------------
-- F. WARRANTY.
--
-- A coverage record, not wording. One row per covered thing, so a job can
-- carry several warranties with different terms (a part with 12 months from
-- the supplier, labour with 3 from the workshop).
--
-- Coverage end is stored, not derived from months, because a warranty's end
-- date is a commitment made at issue time: recomputing it later from a
-- duration would silently move it if the duration were ever edited.
-- ---------------------------------------------------------------------------
do $wstat$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'warranty_status') then
    create type public.warranty_status as enum ('active', 'expired', 'claimed', 'void');
  end if;
end
$wstat$;

create table if not exists public.warranties (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  invoice_id uuid references public.invoices (id) on delete set null,
  performed_item_id uuid references public.job_performed_items (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,

  reference text,
  scope text not null,
  terms text,

  coverage_start date not null default current_date,
  coverage_end date,
  coverage_months integer check (coverage_months is null or coverage_months > 0),
  coverage_mileage integer check (coverage_mileage is null or coverage_mileage > 0),

  status public.warranty_status not null default 'active',

  -- Was it invoked, and what did invoking it lead to? complaint_id is the
  -- repeat-repair / claim relationship: a warranty claim normally arrives as a
  -- complaint, and this is what ties the two together.
  invoked_at timestamptz,
  invoked_reason text,
  complaint_id uuid references public.complaints (id) on delete set null,
  resolution_job_id uuid references public.jobs (id) on delete set null,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint warranties_coverage_window
    check (coverage_end is null or coverage_end >= coverage_start),
  -- A warranty must cover something measurable, or it is only wording again.
  constraint warranties_has_duration
    check (coverage_end is not null or coverage_months is not null or coverage_mileage is not null),
  constraint warranties_claimed_has_invocation
    check (status <> 'claimed' or invoked_at is not null)
);

comment on table public.warranties is
  'First-class warranty coverage records: which customer, vehicle, job, performed item or product is covered, for how long, and whether it was invoked. Distinct from the warranty_terms free text on products/quotations, which is wording (TRUST-01).';

create index if not exists warranties_customer_idx on public.warranties (customer_id);
create index if not exists warranties_vehicle_idx on public.warranties (vehicle_id);
create index if not exists warranties_job_idx on public.warranties (job_id);
create index if not exists warranties_status_idx on public.warranties (business_id, status);
create index if not exists warranties_complaint_idx on public.warranties (complaint_id);

-- ---------------------------------------------------------------------------
-- G. RLS and grants for the two new tables.
--
-- Staff manage; the linked customer reads their own. Customers get SELECT on
-- warranties because a warranty is a commitment made TO them -- but not on
-- job_performed_items, which carries internal notes and is staff workshop
-- detail. If performed work is ever surfaced in the portal it needs its own
-- customer-safe projection, not a widened policy.
--
-- Every policy proves parent tenancy, not just the row's own business_id --
-- the APPSEC-18 lesson. The composite foreign keys applied in section H make
-- that structural as well.
-- ---------------------------------------------------------------------------
-- quotation_item_in_business completes the helper set the policies below use.
-- Defined before them: a policy body is parsed at creation time, so a helper
-- declared afterwards fails the migration.
create or replace function public.quotation_item_in_business(
  target_item_id uuid,
  target_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_item_id is null or exists (
    select 1 from public.quotation_items qi
    where qi.id = target_item_id and qi.business_id = target_business_id
  );
$$;

alter table public.job_performed_items enable row level security;
alter table public.warranties enable row level security;

drop policy if exists "job_performed_items_staff_read" on public.job_performed_items;
create policy "job_performed_items_staff_read" on public.job_performed_items
  for select using (public.is_business_member(business_id));

drop policy if exists "job_performed_items_staff_manage" on public.job_performed_items;
create policy "job_performed_items_staff_manage" on public.job_performed_items
  for all
  using (
    public.is_business_member(business_id)
    and public.job_in_business(job_id, business_id)
  )
  with check (
    public.is_business_member(business_id)
    and public.job_in_business(job_id, business_id)
    and public.quotation_item_in_business(source_quotation_item_id, business_id)
    and public.product_in_business(product_id, business_id)
  );

drop policy if exists "warranties_access" on public.warranties;
create policy "warranties_access" on public.warranties
  for select using (
    public.is_business_member(business_id)
    or public.is_customer_for_business(business_id, customer_id)
  );

drop policy if exists "warranties_staff_manage" on public.warranties;
create policy "warranties_staff_manage" on public.warranties
  for all
  using (
    public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[])
  )
  with check (
    public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[])
    and public.customer_in_business(customer_id, business_id)
    and public.vehicle_in_business(vehicle_id, business_id)
    and public.job_in_business(job_id, business_id)
    and public.invoice_in_business(invoice_id, business_id)
    and public.complaint_in_business(complaint_id, business_id)
    and public.product_in_business(product_id, business_id)
  );

grant select, insert, update, delete on public.job_performed_items to authenticated, service_role;
grant select, insert, update, delete on public.warranties to authenticated, service_role;
-- Not TRUNCATE/TRIGGER/REFERENCES: see APPSEC-21 in 0042. RLS cannot govern
-- TRUNCATE, so the API roles must never hold it.

drop trigger if exists job_performed_items_updated_at on public.job_performed_items;
create trigger job_performed_items_updated_at
  before update on public.job_performed_items
  for each row execute function public.set_updated_at();

drop trigger if exists warranties_updated_at on public.warranties;
create trigger warranties_updated_at
  before update on public.warranties
  for each row execute function public.set_updated_at();

-- Material lifecycle events, so they are audited like the rest (APPSEC-21).
drop trigger if exists job_performed_items_audit on public.job_performed_items;
create trigger job_performed_items_audit
  after insert or update or delete on public.job_performed_items
  for each row execute function public.audit_row_change();

drop trigger if exists warranties_audit on public.warranties;
create trigger warranties_audit
  after insert or update or delete on public.warranties
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- H. Re-apply tenant parent/child integrity to everything added above.
--
-- 0039 encoded the invariant as a rule over the catalog, but it ran once. The
-- new columns and tables here introduce fresh tenant parent/child references,
-- and they must inherit it -- which is why the builder is extracted into a
-- callable function now instead of being copied. Any future migration that
-- adds such a reference calls this, and `pnpm audit:tenant-fks` fails the
-- build if it forgets.
-- ---------------------------------------------------------------------------
create or replace function public.apply_tenant_parent_integrity()
returns text
language plpgsql
set search_path = public
as $$
declare
  rel record;
  cname text;
  violations bigint;
  report text := '';
  total bigint := 0;
  added integer := 0;
begin
  -- Census first: never constrain over corrupt data, never delete it.
  for rel in select * from public.tenant_parent_child_relations() loop
    execute format(
      'select count(*) from public.%I c join public.%I p on p.id = c.%I
         where c.%I is not null and c.business_id is not null
           and p.business_id is distinct from c.business_id',
      rel.child, rel.parent, rel.fk_column, rel.fk_column
    ) into violations;
    if violations > 0 then
      total := total + violations;
      report := report || format(E'\n  %s.%s -> %s: %s row(s)',
        rel.child, rel.fk_column, rel.parent, violations);
    end if;
  end loop;

  if total > 0 then
    raise exception
      E'Cross-tenant parent/child violations present; refusing to add integrity constraints over corrupt data.%s\nTotal: % row(s).',
      report, total;
  end if;

  -- Parent uniqueness, then the composite foreign key and its index.
  for rel in select distinct parent from public.tenant_parent_child_relations() loop
    cname := left(rel.parent || '_id_business_id_key', 63);
    if not exists (
      select 1 from pg_constraint
      where conrelid = ('public.' || rel.parent)::regclass and conname = cname
    ) then
      execute format('alter table public.%I add constraint %I unique (id, business_id)',
        rel.parent, cname);
    end if;
  end loop;

  for rel in select * from public.tenant_parent_child_relations() loop
    cname := left(rel.child || '_' || rel.fk_column || '_tenant_fkey', 63);
    if not exists (
      select 1 from pg_constraint
      where conrelid = ('public.' || rel.child)::regclass and conname = cname
    ) then
      execute format(
        'alter table public.%I add constraint %I
           foreign key (%I, business_id) references public.%I (id, business_id)
           on update cascade',
        rel.child, cname, rel.fk_column, rel.parent);
      execute format('create index if not exists %I on public.%I (%I, business_id)',
        left(rel.child || '_' || rel.fk_column || '_tenant_idx', 63),
        rel.child, rel.fk_column);
      added := added + 1;
    end if;
  end loop;

  return format('tenant parent/child integrity applied: %s new composite constraint(s)', added);
end;
$$;

comment on function public.apply_tenant_parent_integrity() is
  'Applies the APPSEC-18 invariant (child.business_id = parent.business_id) to every tenant parent/child reference that lacks a composite FK. Idempotent. Call this from any migration that adds such a reference; pnpm audit:tenant-fks fails the build if it is forgotten.';

do $apply$
declare
  result text;
begin
  select public.apply_tenant_parent_integrity() into result;
  raise notice 'TRUST-01: %', result;
end
$apply$;

-- ---------------------------------------------------------------------------
-- I. Report what could not be backfilled.
-- ---------------------------------------------------------------------------
do $report$
declare
  jobs_without_vehicle bigint;
  jobs_total bigint;
begin
  select count(*) into jobs_without_vehicle from public.jobs where vehicle_id is null;
  select count(*) into jobs_total from public.jobs;
  if jobs_without_vehicle > 0 then
    raise notice
      'TRUST-01: % of % job(s) still have no vehicle link (no quotation, or the quotation names no vehicle). They are listed by public.jobs_missing_vehicle and need operator attention; guessing a vehicle would fabricate service history.',
      jobs_without_vehicle, jobs_total;
  else
    raise notice 'TRUST-01: all % job(s) have a vehicle link.', jobs_total;
  end if;
end
$report$;

alter table public.jobs validate constraint jobs_delivery_after_completion;
