\set ON_ERROR_STOP off
\pset pager off
\set QUIET on

-- ============================================================================
-- Cross-tenant parent/child integrity — database security harness
--
-- WHAT THIS PROVES
-- Every tenant-owned child table in Revora carries its own `business_id` AND a
-- foreign key to a parent row. The client supplies both. PostgreSQL validates
-- foreign keys with RLS BYPASSED, so an FK aimed at another tenant's row
-- satisfies referential integrity happily; if the table's RLS policy only
-- inspects `business_id`, nothing ever proves the two agree. An attacker with
-- a legitimate session in tenant A can then write rows that hang off tenant B's
-- parents.
--
-- Migration 0035 fixed this for the tables introduced in 0034. This harness
-- covers the ORIGINAL 0001/0002 tables, which were never given the same
-- treatment, and is the regression gate for migration 0039.
--
-- HOW TO RUN (from apps/web)
--   node scripts/db-test.mjs --reset --run ../../supabase/tests/tenant_parent_integrity_tests.sql
--
-- To confirm the harness can actually FAIL (positive control), build the
-- pre-fix schema and run the same file -- the attacks should SUCCEED there:
--   node scripts/db-test.mjs --reset --up-to 0038 --run ../../supabase/tests/tenant_parent_integrity_tests.sql
--
-- READING THE OUTPUT
-- Each case prints `CASE <name>=PASS|FAIL`. A case PASSES when a cross-tenant
-- write is REFUSED, and when a legitimate same-tenant write is ACCEPTED. The
-- final line is TENANT_INTEGRITY_OK only when every case passed.
--
-- NEVER RUN THIS AGAINST PRODUCTION. It runs as `postgres` and writes fixture
-- rows. Fixtures are confined to the two tenants below, which this file
-- creates and owns (prefix `f0a11ce0`), so on a correct target it cannot touch
-- real data -- but it is still a destructive script.
-- ============================================================================

\set BIZ_A '''f0a11ce0-0001-4a00-8000-000000000001'''
\set BIZ_B '''f0a11ce0-0002-4a00-8000-000000000002'''

\set MGR_A '''f0a11ce0-1001-4a00-8000-000000000001'''
\set CUS_A_USER '''f0a11ce0-1002-4a00-8000-000000000002'''
\set MGR_B '''f0a11ce0-1003-4a00-8000-000000000003'''
\set CUS_B_USER '''f0a11ce0-1004-4a00-8000-000000000004'''

\set CUST_A '''f0a11ce0-2001-4a00-8000-000000000001'''
\set CUST_B '''f0a11ce0-2002-4a00-8000-000000000002'''
\set QUOTE_A '''f0a11ce0-3001-4a00-8000-000000000001'''
\set QUOTE_B '''f0a11ce0-3002-4a00-8000-000000000002'''
\set COMPLAINT_B '''f0a11ce0-4002-4a00-8000-000000000002'''
\set JOB_B '''f0a11ce0-5002-4a00-8000-000000000002'''

-- ---------- preflight ----------
\set ON_ERROR_STOP on
do $preflight$
declare
  missing text;
begin
  select string_agg(t, ', ') into missing
  from unnest(array[
    'businesses','business_members','customers','quotations','quotation_items',
    'quotation_revisions','approvals','complaints','complaint_evidence',
    'jobs','job_updates'
  ]) as t
  where to_regclass('public.' || t) is null;

  if missing is not null then
    raise exception 'core schema missing (%). Apply migrations first.', missing;
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Result ledger + attack driver
--
-- _sec_try executes one statement as `authenticated` with a chosen subject's
-- JWT claims -- the same two connection settings PostgREST sets, which is the
-- whole of its contribution to an RLS decision. It returns the SQLSTATE:
-- '00000' means the write was ACCEPTED.
--
-- The role switch matters: `postgres` owns these tables and RLS does not apply
-- to a table owner, so a test that forgot to drop privileges would pass
-- vacuously. Dropping to `authenticated` is what makes the policies run.
-- ---------------------------------------------------------------------------
drop table if exists public._sec_results;
create table public._sec_results (
  seq serial primary key,
  name text not null,
  expectation text not null,     -- 'reject' | 'accept'
  sqlstate text not null,
  passed boolean not null,
  detail text
);

create or replace function public._sec_try(p_sql text, p_sub uuid)
returns text
language plpgsql
as $$
declare
  state text := '00000';
begin
  -- SET LOCAL is transactional; the outer block's rollback restores it.
  execute format('set local role authenticated');
  execute format(
    'set local request.jwt.claims = %L',
    json_build_object('sub', p_sub::text, 'role', 'authenticated')::text
  );
  begin
    execute p_sql;
  exception when others then
    state := sqlstate;
  end;
  execute 'reset role';
  execute 'select set_config(''request.jwt.claims'', '''', true)';
  return state;
end;
$$;

create or replace function public._sec_case(
  p_name text, p_expect text, p_sql text, p_sub uuid
) returns void
language plpgsql
as $$
declare
  state text;
  ok boolean;
begin
  state := public._sec_try(p_sql, p_sub);
  ok := case when p_expect = 'reject' then state <> '00000'
             else state = '00000' end;
  insert into public._sec_results (name, expectation, sqlstate, passed, detail)
  values (p_name, p_expect, state, ok,
          case when state = '00000' then 'accepted' else 'refused ' || state end);
end;
$$;

-- ---------- fixtures ----------
-- Self-seeding and idempotent: two tenants, a manager and a portal customer in
-- each, and the parent rows an attacker would aim at in tenant B.
-- Teardown runs with triggers suppressed, which also disables the internal FK
-- cascade triggers -- so nothing is relied on to cascade and every fixture row
-- is removed explicitly. The sweep is schema-agnostic: it clears the two
-- fixture tenants out of EVERY public table carrying a business_id, so a table
-- added later cannot quietly leave rows behind and break the next run. Without
-- replica mode the cascaded deletes fire audit_row_change(), which inserts an
-- audit_events row referencing the business being removed in the same
-- statement, and the audit_events FK (the only NO ACTION reference to
-- businesses) rejects it.
--
-- `origin` is restored immediately afterwards, so every assertion below runs
-- with the real triggers in force -- including the SECURITY DEFINER approval
-- trigger this file exists to test.
set session_replication_role = replica;
do $teardown$
declare
  t text;
  fixture uuid[] := array[
    'f0a11ce0-0001-4a00-8000-000000000001',
    'f0a11ce0-0002-4a00-8000-000000000002'
  ]::uuid[];
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind = 'r'
      and a.attname = 'business_id'
      and a.attnum > 0
      and not a.attisdropped
      and c.relname <> 'businesses'
  loop
    execute format('delete from public.%I where business_id = any($1)', t)
      using fixture;
  end loop;
  delete from public.businesses where id = any(fixture);
end
$teardown$;
delete from auth.users where id in (:MGR_A, :CUS_A_USER, :MGR_B, :CUS_B_USER);
set session_replication_role = origin;

insert into auth.users (id, email, email_confirmed_at)
values (:MGR_A, 'mgr-a@integrity.test', now()),
       (:CUS_A_USER, 'cus-a@integrity.test', now()),
       (:MGR_B, 'mgr-b@integrity.test', now()),
       (:CUS_B_USER, 'cus-b@integrity.test', now());

insert into public.businesses (id, name) values (:BIZ_A, 'Tenant A'), (:BIZ_B, 'Tenant B');

insert into public.business_members (business_id, user_id, role, is_active)
values (:BIZ_A, :MGR_A, 'manager', true),
       (:BIZ_B, :MGR_B, 'manager', true);

insert into public.customers (id, business_id, app_user_id, full_name)
values (:CUST_A, :BIZ_A, :CUS_A_USER, 'Customer A'),
       (:CUST_B, :BIZ_B, :CUS_B_USER, 'Customer B');

insert into public.quotations
  (id, business_id, customer_id, quote_number, status, current_version, language)
values (:QUOTE_A, :BIZ_A, :CUST_A, 'Q-A-1', 'sent', 1, 'en'),
       (:QUOTE_B, :BIZ_B, :CUST_B, 'Q-B-1', 'sent', 1, 'en');

insert into public.complaints
  (id, business_id, customer_id, status, severity, subject, description)
values (:COMPLAINT_B, :BIZ_B, :CUST_B, 'open', 'medium', 'B subject', 'B description');

insert into public.jobs (id, business_id, customer_id, status, title)
values (:JOB_B, :BIZ_B, :CUST_B, 'approved', 'Job B');

\set ON_ERROR_STOP off

-- ===========================================================================
-- ATTACKS: tenant A actor, row labelled business_id = A, parent owned by B.
-- Each must be REFUSED.
-- ===========================================================================

-- 1. Quote-approval forgery. Customer A inserts an approval over tenant B's
--    quotation. The approvals_create_job trigger (0015) is SECURITY DEFINER and
--    acts on whatever quotation_id it is handed, so acceptance here also flips
--    B's quote to approved and materialises a job in B.
select public._sec_case(
  'approval_insert_cross_tenant_quotation', 'reject',
  format($q$insert into public.approvals
      (business_id, quotation_id, customer_id, quotation_version, language,
       acknowledgement_text)
    values (%L, %L, %L, 1, 'en', 'forged acknowledgement')$q$,
    :BIZ_A, :QUOTE_B, :CUST_A),
  :CUS_A_USER);

-- 2. Quotation-item injection. Manager A attaches a line to B's quote.
select public._sec_case(
  'quotation_item_insert_cross_tenant_quotation', 'reject',
  format($q$insert into public.quotation_items
      (business_id, quotation_id, kind, name, quantity, unit_price, total)
    values (%L, %L, 'service', 'injected line', 1, 9999, 9999)$q$,
    :BIZ_A, :QUOTE_B),
  :MGR_A);

-- 3. Complaint-evidence injection. Staff A attaches evidence to B's complaint.
select public._sec_case(
  'complaint_evidence_insert_cross_tenant_complaint', 'reject',
  format($q$insert into public.complaint_evidence (business_id, complaint_id)
    values (%L, %L)$q$,
    :BIZ_A, :COMPLAINT_B),
  :MGR_A);

-- 4. Quotation-revision injection. Rewrites the history of B's quote.
select public._sec_case(
  'quotation_revision_insert_cross_tenant_quotation', 'reject',
  format($q$insert into public.quotation_revisions
      (business_id, quotation_id, version, snapshot)
    values (%L, %L, 99, '{"forged":true}'::jsonb)$q$,
    :BIZ_A, :QUOTE_B),
  :MGR_A);

-- 5. Job-update injection. Writes into B's customer-visible work-order feed.
select public._sec_case(
  'job_update_insert_cross_tenant_job', 'reject',
  format($q$insert into public.job_updates
      (business_id, job_id, message, visible_to_customer)
    values (%L, %L, 'injected update', true)$q$,
    :BIZ_A, :JOB_B),
  :MGR_A);

-- ===========================================================================
-- CONTROLS: the same operations within one tenant must still be ACCEPTED.
-- Without these, a policy that denied everything would score a perfect pass.
-- ===========================================================================

select public._sec_case(
  'control_quotation_item_same_tenant', 'accept',
  format($q$insert into public.quotation_items
      (business_id, quotation_id, kind, name, quantity, unit_price, total)
    values (%L, %L, 'service', 'legitimate line', 1, 100, 100)$q$,
    :BIZ_A, :QUOTE_A),
  :MGR_A);

select public._sec_case(
  'control_quotation_revision_same_tenant', 'accept',
  format($q$insert into public.quotation_revisions
      (business_id, quotation_id, version, snapshot)
    values (%L, %L, 1, '{"ok":true}'::jsonb)$q$,
    :BIZ_A, :QUOTE_A),
  :MGR_A);

-- Since 0040 there is ONE approval door: the RPC. A direct table insert is
-- refused even for the customer's own quotation, because `authenticated` holds
-- no INSERT privilege on approvals at all. This case therefore asserts the
-- canonical path is closed to direct writes...
select public._sec_case(
  'direct_approval_insert_refused_even_same_tenant', 'reject',
  format($q$insert into public.approvals
      (business_id, quotation_id, customer_id, quotation_version, language,
       acknowledgement_text)
    values (%L, %L, %L, 1, 'en', 'direct insert')$q$,
    :BIZ_A, :QUOTE_A, :CUST_A),
  :CUS_A_USER);

-- ...and this one asserts the canonical path still WORKS, so the revoke above
-- has not simply broken approval for everyone.
select public._sec_case(
  'control_approval_via_canonical_rpc', 'accept',
  format($q$select public.submit_quote_approval(
      %L, 1, 'en', 'I acknowledge the parts, pricing and terms.', 'Customer A')$q$,
    :QUOTE_A),
  :CUS_A_USER);

-- The RPC must refuse a customer who is not the one the quotation was issued
-- to, even though both are legitimate portal users.
select public._sec_case(
  'rpc_refuses_foreign_customer', 'reject',
  format($q$select public.submit_quote_approval(
      %L, 1, 'en', 'I acknowledge.', 'Customer A')$q$,
    :QUOTE_B),
  :CUS_A_USER);

-- ===========================================================================
-- STRUCTURAL LAYER, proven on its own.
--
-- Every refusal above is 42501 -- RLS declining the write. RLS is therefore
-- masking the composite foreign keys, so without this section the structural
-- layer would be asserted and never exercised. These cases run as a role that
-- BYPASSES RLS (the table owner), which is the privilege level a SECURITY
-- DEFINER function, a service_role key or a future migration runs at. The
-- write must still be refused, now by referential integrity (23503).
--
-- This is the difference between "the policy currently says no" and "the
-- database cannot represent it".
-- ===========================================================================
do $structural$
declare
  state text;
begin
  begin
    insert into public.quotation_items
      (business_id, quotation_id, kind, name, quantity, unit_price, total)
    values ('f0a11ce0-0001-4a00-8000-000000000001',
            'f0a11ce0-3002-4a00-8000-000000000002', 'service', 'rls-bypassed', 1, 1, 1);
    state := '00000';
  exception when others then
    state := sqlstate;
  end;
  insert into public._sec_results (name, expectation, sqlstate, passed, detail)
  values ('structural_fk_blocks_item_with_rls_bypassed', 'reject', state,
          state = '23503',
          case when state = '00000' then 'ACCEPTED with RLS bypassed'
               else 'refused ' || state end);

  begin
    insert into public.approvals
      (business_id, quotation_id, customer_id, quotation_version, language,
       acknowledgement_text)
    values ('f0a11ce0-0001-4a00-8000-000000000001',
            'f0a11ce0-3002-4a00-8000-000000000002',
            'f0a11ce0-2001-4a00-8000-000000000001', 1, 'en', 'rls-bypassed');
    state := '00000';
  exception when others then
    state := sqlstate;
  end;
  insert into public._sec_results (name, expectation, sqlstate, passed, detail)
  values ('structural_fk_blocks_approval_with_rls_bypassed', 'reject', state,
          state = '23503',
          case when state = '00000' then 'ACCEPTED with RLS bypassed'
               else 'refused ' || state end);

  -- The trigger's own guard, reached by making the approval structurally
  -- valid for its tenant but pointing the trigger at a foreign quotation is
  -- impossible now -- so instead assert the guard exists and fails closed when
  -- invoked on a mismatch, which is what protects service-role callers.
  begin
    insert into public.approvals
      (business_id, quotation_id, customer_id, quotation_version, language,
       acknowledgement_text)
    values ('f0a11ce0-0002-4a00-8000-000000000002',
            'f0a11ce0-3002-4a00-8000-000000000002',
            'f0a11ce0-2001-4a00-8000-000000000001', 1, 'en', 'wrong customer');
    state := '00000';
  exception when others then
    state := sqlstate;
  end;
  insert into public._sec_results (name, expectation, sqlstate, passed, detail)
  values ('cross_customer_approval_refused_with_rls_bypassed', 'reject', state,
          state <> '00000',
          case when state = '00000' then 'ACCEPTED: customer A approved for tenant B'
               else 'refused ' || state end);
end
$structural$;

-- ===========================================================================
-- SIDE-EFFECT PROOF for case 1: did the privileged trigger mutate tenant B?
-- Checked as postgres, because tenant B's own staff cannot see rows that A
-- planted under business_id = A -- the read asymmetry that makes this class so
-- hard to notice in production.
-- ===========================================================================
insert into public._sec_results (name, expectation, sqlstate, passed, detail)
select
  'side_effect_tenant_b_quote_untouched', 'reject', '-',
  q.status <> 'approved',
  'quote B status=' || q.status
from public.quotations q where q.id = :QUOTE_B;

insert into public._sec_results (name, expectation, sqlstate, passed, detail)
select
  'side_effect_no_forged_job_in_tenant_b', 'reject', '-',
  count(*) = 0,
  'jobs created from quote B=' || count(*)
from public.jobs where quotation_id = :QUOTE_B;

insert into public._sec_results (name, expectation, sqlstate, passed, detail)
select
  'side_effect_no_foreign_items_on_quote_b', 'reject', '-',
  count(*) = 0,
  'rows on quote B labelled another tenant=' || count(*)
from public.quotation_items qi
join public.quotations q on q.id = qi.quotation_id
where q.id = :QUOTE_B and qi.business_id <> q.business_id;

-- ---------- report ----------
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

select format('CASE %s=%s (%s, %s)', name,
              case when passed then 'PASS' else 'FAIL' end,
              expectation, detail)
from public._sec_results order by seq;

select format('cases=%s passed=%s failed=%s',
              count(*), count(*) filter (where passed),
              count(*) filter (where not passed))
from public._sec_results;

select case
  when count(*) filter (where not passed) = 0 then 'TENANT_INTEGRITY_OK'
  else 'TENANT_INTEGRITY_FAILED'
end
from public._sec_results;
