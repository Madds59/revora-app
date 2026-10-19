\set ON_ERROR_STOP off
\pset pager off
\set QUIET on

-- ============================================================================
-- View and function privilege matrix — database security harness
--
-- WHAT THIS PROVES
-- The two classes 0047 closes, measured as behaviour rather than as catalog
-- state alone:
--
--   1. public.jobs_missing_vehicle is a tenant-scoped, read-only report.
--      anon reaches it for nothing; an authenticated member sees their OWN
--      vehicle-less jobs (the control -- without it, a view that denied
--      everything would pass vacuously) and never another tenant's; no API
--      role can write through it, even though PostgreSQL considers it
--      auto-updatable.
--
--   2. public.cross_tenant_reference_audit stays an operator diagnostic.
--      It is cross-tenant by construction, so neither anon nor an ordinary
--      authenticated member may read it at all.
--
--   3. anon executes exactly two SECURITY DEFINER functions -- the token-gated
--      inspection-share resolvers -- and the tenant-scope predicates that
--      0041/0043 left anon-callable through PUBLIC are closed, while
--      `authenticated` keeps the EXECUTE its own RLS policies depend on.
--
-- WHY A VIEW NEEDED ITS OWN HARNESS
-- All 210 pre-existing database cases assert against TABLES. A view is a
-- different object class with different privilege semantics: it runs as its
-- OWNER unless `security_invoker = true` is set, and `postgres` owns every
-- table here, so 0043's reporting view read public.jobs with RLS bypassed
-- entirely. The table-shaped suites could not see it and did not.
--
-- CAN THIS SUITE FAIL?
-- Yes, and it was shown failing before being trusted: run it against the
-- schema WITHOUT 0047 and the anon read, anon write and cross-tenant cases all
-- fail, because that is the live defect this migration closes:
--
--     node scripts/db-test.mjs --reset --up-to 0046 \
--       --run ../../supabase/tests/view_privilege_tests.sql
--
-- HOW TO RUN (from apps/web)
--   node scripts/db-test.mjs --reset --run ../../supabase/tests/view_privilege_tests.sql
--
-- NEVER RUN THIS AGAINST PRODUCTION.
-- It runs as `postgres` (RLS bypassed) and seeds its own tenants. Every id
-- below carries the `0c47a1d0` prefix and belongs to this harness alone.
-- ============================================================================

\set BIZ_A '''0c47a1d0-0001-4a00-8000-000000000001'''
\set BIZ_B '''0c47a1d0-0002-4a00-8000-000000000002'''
\set STAFF_A '''0c47a1d0-1001-4a00-8000-000000000001'''
\set STAFF_B '''0c47a1d0-1002-4a00-8000-000000000002'''
\set CUST_A '''0c47a1d0-2001-4a00-8000-000000000001'''
\set CUST_B '''0c47a1d0-2002-4a00-8000-000000000002'''

\set ON_ERROR_STOP on
do $preflight$
declare
  missing text;
begin
  select string_agg(v, ', ') into missing
  from unnest(array['jobs_missing_vehicle', 'cross_tenant_reference_audit']) as v
  where to_regclass('public.' || v) is null;
  if missing is not null then
    raise exception
      'view schema missing (%). Apply migrations through 0043 before running this harness.',
      missing;
  end if;
end
$preflight$;

drop table if exists public._vp_results;
create table public._vp_results (
  seq serial primary key,
  surface text not null,
  actor text not null,
  expectation text not null,
  observed text,
  passed boolean not null
);

-- Rows visible to a subject under their own policies. Returns -1 for a
-- REFUSAL, so "denied outright" and "allowed but saw nothing" stay distinct --
-- they are different security properties and conflating them hides regressions.
create or replace function public._vp_count(p_role text, p_sub uuid, p_sql text)
returns bigint
language plpgsql
as $fn$
declare n bigint;
begin
  execute format('set local role %I', p_role);
  if p_sub is not null then
    execute format('set local request.jwt.claims = %L',
      json_build_object('sub', p_sub::text, 'role', p_role)::text);
  else
    perform set_config('request.jwt.claims', '', true);
  end if;
  begin
    execute p_sql into n;
  exception when others then
    n := -1;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return coalesce(n, 0);
end;
$fn$;

-- Attempts a write and returns the SQLSTATE that refused it, or 'OK' if the
-- write succeeded. The SQLSTATE matters: pre-0047 an anon INSERT through this
-- view already failed, but with 23502 (not_null_violation) because public.jobs
-- requires `title`, which the view does not expose -- a data refusal, not a
-- privilege one. Asserting "was refused" would therefore have passed against
-- the live defect. Asserting 42501 (insufficient_privilege) is the real oracle.
--
-- The statement runs inside a subtransaction that is always rolled back, so a
-- write that wrongly SUCCEEDS is detected without leaving the row behind: the
-- sentinel raise aborts the subtransaction either way.
create or replace function public._vp_write_sqlstate(p_role text, p_sub uuid, p_sql text)
returns text
language plpgsql
as $fn$
declare outcome text;
begin
  execute format('set local role %I', p_role);
  if p_sub is not null then
    execute format('set local request.jwt.claims = %L',
      json_build_object('sub', p_sub::text, 'role', p_role)::text);
  else
    perform set_config('request.jwt.claims', '', true);
  end if;
  begin
    execute p_sql;
    raise exception '_VP_WROTE_OK';
  exception when others then
    outcome := case when sqlerrm = '_VP_WROTE_OK' then 'OK' else sqlstate end;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return outcome;
end;
$fn$;

create or replace function public._vp_record(
  p_surface text, p_actor text, p_expectation text, p_observed text, p_passed boolean
) returns void language sql as $fn$
  insert into public._vp_results (surface, actor, expectation, observed, passed)
  values (p_surface, p_actor, p_expectation, p_observed, p_passed);
$fn$;

-- ---------- fixtures ----------
delete from public.jobs where business_id in (:BIZ_A, :BIZ_B);
delete from public.customers where business_id in (:BIZ_A, :BIZ_B);
delete from public.business_members where business_id in (:BIZ_A, :BIZ_B);
delete from public.businesses where id in (:BIZ_A, :BIZ_B);
delete from auth.users where id in (:STAFF_A, :STAFF_B);

insert into auth.users (id, email, email_confirmed_at) values
  (:STAFF_A, 'staff-a@viewpriv.test', now()),
  (:STAFF_B, 'staff-b@viewpriv.test', now());

insert into public.businesses (id, name, trn) values
  (:BIZ_A, 'ViewPriv Tenant A', '100000000000047'),
  (:BIZ_B, 'ViewPriv Tenant B', '100000000000048');

insert into public.business_members (business_id, user_id, role, is_active) values
  (:BIZ_A, :STAFF_A, 'business_owner', true),
  (:BIZ_B, :STAFF_B, 'business_owner', true);

insert into public.customers (id, business_id, full_name) values
  (:CUST_A, :BIZ_A, 'ViewPriv Customer A'),
  (:CUST_B, :BIZ_B, 'ViewPriv Customer B');

-- Vehicle-less jobs: exactly what the view reports. vehicle_id stays NULL.
insert into public.jobs (business_id, customer_id, title) values
  (:BIZ_A, :CUST_A, 'ViewPriv A job 1'),
  (:BIZ_A, :CUST_A, 'ViewPriv A job 2'),
  (:BIZ_B, :CUST_B, 'ViewPriv B job 1');

\set ON_ERROR_STOP off

-- ---------- 1. jobs_missing_vehicle: reads ----------
do $reads$
declare n bigint;
begin
  -- The control. If this is 0 the rest of the matrix proves nothing.
  n := public._vp_count('authenticated', '0c47a1d0-1001-4a00-8000-000000000001',
    'select count(*) from public.jobs_missing_vehicle');
  perform public._vp_record('jobs_missing_vehicle', 'tenant A owner reads the view',
    '= 2 own rows', n::text, n = 2);

  n := public._vp_count('authenticated', '0c47a1d0-1001-4a00-8000-000000000001',
    'select count(*) from public.jobs_missing_vehicle where business_id = ''0c47a1d0-0002-4a00-8000-000000000002''');
  perform public._vp_record('jobs_missing_vehicle', 'tenant A owner reading tenant B',
    '= 0', n::text, n = 0);

  n := public._vp_count('authenticated', '0c47a1d0-1002-4a00-8000-000000000002',
    'select count(*) from public.jobs_missing_vehicle where business_id = ''0c47a1d0-0001-4a00-8000-000000000001''');
  perform public._vp_record('jobs_missing_vehicle', 'tenant B owner reading tenant A',
    '= 0', n::text, n = 0);

  -- The live defect: unauthenticated cross-tenant read through the view.
  n := public._vp_count('anon', null, 'select count(*) from public.jobs_missing_vehicle');
  perform public._vp_record('jobs_missing_vehicle', 'anon reads the view',
    'refused (-1)', n::text, n = -1);
end
$reads$;

-- ---------- 2. jobs_missing_vehicle: writes ----------
-- PostgreSQL reports this view as auto-updatable
-- (information_schema.views.is_updatable = YES), so the write path was real.
-- Every case below demands 42501 insufficient_privilege: the write must be
-- stopped at the privilege layer, not incidentally by a column constraint.
do $writes$
declare st text;
begin
  st := public._vp_write_sqlstate('anon', null,
    'insert into public.jobs_missing_vehicle (id, business_id, customer_id, status, created_at) values (gen_random_uuid(), ''0c47a1d0-0001-4a00-8000-000000000001'', ''0c47a1d0-2001-4a00-8000-000000000001'', ''pending'', now())');
  perform public._vp_record('jobs_missing_vehicle', 'anon INSERT',
    '42501 insufficient_privilege', st, st = '42501');

  -- `set status = status` writes without changing a value, so no constraint,
  -- trigger or foreign key can refuse it. Only privilege can.
  st := public._vp_write_sqlstate('anon', null,
    'update public.jobs_missing_vehicle set status = status');
  perform public._vp_record('jobs_missing_vehicle', 'anon UPDATE',
    '42501 insufficient_privilege', st, st = '42501');

  st := public._vp_write_sqlstate('anon', null, 'delete from public.jobs_missing_vehicle');
  perform public._vp_record('jobs_missing_vehicle', 'anon DELETE',
    '42501 insufficient_privilege', st, st = '42501');

  st := public._vp_write_sqlstate('authenticated', '0c47a1d0-1001-4a00-8000-000000000001',
    'update public.jobs_missing_vehicle set status = status');
  perform public._vp_record('jobs_missing_vehicle', 'tenant A owner UPDATE',
    '42501 insufficient_privilege', st, st = '42501');

  st := public._vp_write_sqlstate('authenticated', '0c47a1d0-1001-4a00-8000-000000000001',
    'delete from public.jobs_missing_vehicle');
  perform public._vp_record('jobs_missing_vehicle', 'tenant A owner DELETE',
    '42501 insufficient_privilege', st, st = '42501');
end
$writes$;

-- ---------- 3. cross_tenant_reference_audit stays operator-only ----------
do $diag$
declare n bigint;
begin
  n := public._vp_count('anon', null, 'select count(*) from public.cross_tenant_reference_audit');
  perform public._vp_record('cross_tenant_reference_audit', 'anon reads the diagnostic',
    'refused (-1)', n::text, n = -1);

  n := public._vp_count('authenticated', '0c47a1d0-1001-4a00-8000-000000000001',
    'select count(*) from public.cross_tenant_reference_audit');
  perform public._vp_record('cross_tenant_reference_audit', 'tenant A owner reads the diagnostic',
    'refused (-1)', n::text, n = -1);
end
$diag$;

-- ---------- 4. the view catalog state itself ----------
do $catalog$
declare bad text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and coalesce(c.reloptions::text, '') not like '%security_invoker=true%';
  perform public._vp_record('all public views', 'security_invoker = true',
    'no owner-rights views', coalesce(bad, 'none'), bad is null);

  select string_agg(format('%s:%s:%s', c.relname, r.role, p.priv), ', ') into bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace,
         (values ('anon'), ('authenticated')) as r(role),
         (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as p(priv)
   where n.nspname = 'public' and c.relkind = 'v'
     and has_table_privilege(r.role, c.oid, p.priv);
  perform public._vp_record('all public views', 'effective write privileges',
    'none for anon or authenticated', coalesce(bad, 'none'), bad is null);
end
$catalog$;

-- ---------- 5. the anonymous SECURITY DEFINER allowlist ----------
do $fns$
declare bad text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and p.proname not in ('resolve_inspection_share', 'resolve_inspection_share_items');
  perform public._vp_record('secdef functions', 'anon EXECUTE outside the allowlist',
    'none', coalesce(bad, 'none'), bad is null);

  -- Closing the hole by breaking the public share link is not a fix.
  perform public._vp_record('secdef functions', 'anon keeps resolve_inspection_share',
    'executable',
    has_function_privilege('anon', 'public.resolve_inspection_share(bytea)', 'EXECUTE')::text,
    has_function_privilege('anon', 'public.resolve_inspection_share(bytea)', 'EXECUTE'));
  perform public._vp_record('secdef functions', 'anon keeps resolve_inspection_share_items',
    'executable',
    has_function_privilege('anon', 'public.resolve_inspection_share_items(bytea)', 'EXECUTE')::text,
    has_function_privilege('anon', 'public.resolve_inspection_share_items(bytea)', 'EXECUTE'));

  -- The two tenant predicates: closed to anon, still available to the RLS
  -- policies on warranties / job_performed_items / complaint_evidence.
  perform public._vp_record('secdef functions', 'anon cannot execute complaint_in_business',
    'false',
    has_function_privilege('anon', 'public.complaint_in_business(uuid,uuid)', 'EXECUTE')::text,
    not has_function_privilege('anon', 'public.complaint_in_business(uuid,uuid)', 'EXECUTE'));
  perform public._vp_record('secdef functions', 'anon cannot execute quotation_item_in_business',
    'false',
    has_function_privilege('anon', 'public.quotation_item_in_business(uuid,uuid)', 'EXECUTE')::text,
    not has_function_privilege('anon', 'public.quotation_item_in_business(uuid,uuid)', 'EXECUTE'));
  perform public._vp_record('secdef functions', 'authenticated keeps complaint_in_business',
    'true',
    has_function_privilege('authenticated', 'public.complaint_in_business(uuid,uuid)', 'EXECUTE')::text,
    has_function_privilege('authenticated', 'public.complaint_in_business(uuid,uuid)', 'EXECUTE'));
  perform public._vp_record('secdef functions', 'authenticated keeps quotation_item_in_business',
    'true',
    has_function_privilege('authenticated', 'public.quotation_item_in_business(uuid,uuid)', 'EXECUTE')::text,
    has_function_privilege('authenticated', 'public.quotation_item_in_business(uuid,uuid)', 'EXECUTE'));
end
$fns$;

-- ---------- 6. the policies those predicates serve still work ----------
-- Revoking EXECUTE from PUBLIC must not have broken an authenticated member's
-- own reads on the three tables whose policies call the predicates.
do $policies$
declare n bigint;
begin
  n := public._vp_count('authenticated', '0c47a1d0-1001-4a00-8000-000000000001',
    'select count(*) from public.warranties');
  perform public._vp_record('warranties', 'tenant A owner reads (policy calls complaint_in_business)',
    'allowed, not refused', n::text, n >= 0);

  n := public._vp_count('authenticated', '0c47a1d0-1001-4a00-8000-000000000001',
    'select count(*) from public.job_performed_items');
  perform public._vp_record('job_performed_items', 'tenant A owner reads (policy calls quotation_item_in_business)',
    'allowed, not refused', n::text, n >= 0);

  n := public._vp_count('authenticated', '0c47a1d0-1001-4a00-8000-000000000001',
    'select count(*) from public.complaint_evidence');
  perform public._vp_record('complaint_evidence', 'tenant A owner reads (policy calls complaint_in_business)',
    'allowed, not refused', n::text, n >= 0);
end
$policies$;

-- ---------- report ----------
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

select format('CASE %s / %s = %s (expect %s, observed %s)',
              surface, actor, case when passed then 'PASS' else 'FAIL' end,
              expectation, coalesce(observed, 'n/a'))
from public._vp_results where not passed order by seq;

select format('cases=%s passed=%s failed=%s surfaces=%s',
              count(*), count(*) filter (where passed),
              count(*) filter (where not passed), count(distinct surface))
from public._vp_results;

select case when count(*) filter (where not passed) = 0
            then 'VIEW_PRIVILEGE_OK' else 'VIEW_PRIVILEGE_FAILED' end
from public._vp_results;
