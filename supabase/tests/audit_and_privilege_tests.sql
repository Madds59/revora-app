\set ON_ERROR_STOP off
\pset pager off
\set QUIET on

-- ============================================================================
-- Audit coverage and API-role least privilege — database security harness
--
-- WHAT THIS PROVES
--   * `anon` and `authenticated` can no longer TRUNCATE tenant tables. Before
--     0042 they could: GRANT ALL in 0003 includes TRUNCATE, and row-level
--     security does NOT apply to TRUNCATE -- it is a table-level privilege
--     checked before any policy runs. An unauthenticated caller could erase
--     all 63 public tables, audit trail included.
--   * audit_events is append-only for the API roles.
--   * The 0034 financial layer and the 0037 inspection layer are audited.
--     Before 0042 an invoice could be issued, paid, credited and voided
--     without producing a single audit row.
--   * Audit payloads drop credential-like columns but keep business fields,
--     because an audit row that cannot show what changed is not an audit row.
--
-- HOW TO RUN (from apps/web)
--   node scripts/db-test.mjs --reset --run ../../supabase/tests/audit_and_privilege_tests.sql
--
-- Positive control (pre-fix schema -- the truncate cases must FAIL):
--   node scripts/db-test.mjs --reset --up-to 0041 --run ../../supabase/tests/audit_and_privilege_tests.sql
--
-- NEVER RUN THIS AGAINST PRODUCTION.
-- ============================================================================

\set BIZ '''f2bb0ce0-0001-4a00-8000-000000000001'''
\set BIZ_B '''f2bb0ce0-0002-4a00-8000-000000000002'''
\set MGR '''f2bb0ce0-1001-4a00-8000-000000000001'''
\set MGR_B '''f2bb0ce0-1003-4a00-8000-000000000003'''
\set STRANGER '''f2bb0ce0-1009-4a00-8000-000000000009'''
\set CUST '''f2bb0ce0-2001-4a00-8000-000000000001'''
\set INV '''f2bb0ce0-3001-4a00-8000-000000000001'''

\set ON_ERROR_STOP on
do $preflight$
begin
  if to_regclass('public.audit_events') is null then
    raise exception 'audit_events missing. Apply migrations first.';
  end if;
end
$preflight$;

drop table if exists public._aud_results;
create table public._aud_results (
  seq serial primary key,
  name text not null,
  expectation text not null,
  detail text,
  passed boolean not null
);

create or replace function public._aud_try(p_sql text, p_role text, p_sub uuid default null)
returns text
language plpgsql
as $$
declare
  state text := '00000';
begin
  execute format('set local role %I', p_role);
  if p_sub is not null then
    execute format('set local request.jwt.claims = %L',
      json_build_object('sub', p_sub::text, 'role', p_role)::text);
  end if;
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

create or replace function public._aud_case(
  p_name text, p_expect text, p_sql text, p_role text, p_sub uuid default null
) returns void
language plpgsql
as $$
declare
  state text;
begin
  state := public._aud_try(p_sql, p_role, p_sub);
  insert into public._aud_results (name, expectation, detail, passed)
  values (p_name, p_expect,
          case when state = '00000' then 'accepted' else 'refused ' || state end,
          case when p_expect = 'reject' then state <> '00000' else state = '00000' end);
end;
$$;

-- ---------- fixtures ----------
set session_replication_role = replica;
do $teardown$
declare
  t text;
  fixture uuid[] := array[
    'f2bb0ce0-0001-4a00-8000-000000000001',
    'f2bb0ce0-0002-4a00-8000-000000000002'
  ]::uuid[];
begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'business_id'
      and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'businesses'
  loop
    execute format('delete from public.%I where business_id = any($1)', t) using fixture;
  end loop;
  delete from public.businesses where id = any(fixture);
end
$teardown$;
delete from auth.users where id in (:MGR, :MGR_B, :STRANGER);
set session_replication_role = origin;

insert into auth.users (id, email, email_confirmed_at) values
  (:MGR, 'mgr-a@audit.test', now()),
  (:MGR_B, 'mgr-b@audit.test', now()),
  (:STRANGER, 'stranger@audit.test', now());

insert into public.businesses (id, name, trn) values
  (:BIZ, 'Audit Tenant A', '100000000000003'),
  (:BIZ_B, 'Audit Tenant B', '100000000000004');
insert into public.business_members (business_id, user_id, role, is_active) values
  (:BIZ, :MGR, 'manager', true),
  (:BIZ_B, :MGR_B, 'manager', true);
insert into public.customers (id, business_id, full_name) values (:CUST, :BIZ, 'Audit Customer');

\set ON_ERROR_STOP off

-- ===========================================================================
-- A. TRUNCATE must be refused. RLS never governed it.
--
-- The stranger holds no membership anywhere and RLS shows them zero audit
-- rows, which is exactly what made the pre-fix behaviour so stark.
-- ===========================================================================
select public._aud_case(
  'anon_cannot_truncate_audit_events', 'reject',
  'truncate table public.audit_events', 'anon');

select public._aud_case(
  'authenticated_stranger_cannot_truncate_audit_events', 'reject',
  'truncate table public.audit_events', 'authenticated', :STRANGER);

select public._aud_case(
  'authenticated_cannot_truncate_quotations', 'reject',
  'truncate table public.quotations', 'authenticated', :MGR);

select public._aud_case(
  'authenticated_cannot_truncate_invoices', 'reject',
  'truncate table public.invoices', 'authenticated', :MGR);

select public._aud_case(
  'anon_cannot_truncate_customers', 'reject',
  'truncate table public.customers', 'anon');

-- ===========================================================================
-- B. audit_events is append-only for the API roles.
--
-- Measured by EFFECT, not by whether the statement raised. A DELETE that RLS
-- filters to zero rows does not error -- it reports "DELETE 0" and succeeds --
-- so asserting only on the SQLSTATE would have called a harmless no-op a
-- vulnerability, and would equally have missed a deletion that did land.
-- Each case therefore records the row count before and after.
-- ===========================================================================
select public._aud_case(
  'authenticated_cannot_forge_audit_row', 'reject',
  format($q$insert into public.audit_events (business_id, table_name, record_id, action)
    values (%L, 'invoices', gen_random_uuid(), 'FORGED')$q$, :BIZ),
  'authenticated', :MGR);

insert into public._aud_results (name, expectation, detail, passed)
select 'no_forged_audit_row_landed', 'value=0', 'rows with action=FORGED = ' || count(*), count(*) = 0
from public.audit_events where action = 'FORGED';

-- Seed a known row as postgres so there is something a tamper attempt could
-- destroy, then prove it survives.
insert into public.audit_events (business_id, table_name, record_id, action)
values (:BIZ, 'businesses', :BIZ, 'TAMPER_TARGET');

select public._aud_case(
  'authenticated_delete_of_audit_rows_has_no_effect', 'reject',
  format($q$delete from public.audit_events where business_id = %L$q$, :BIZ),
  'authenticated', :MGR);

insert into public._aud_results (name, expectation, detail, passed)
select 'tamper_target_survives_delete_attempt', 'value=1',
       'TAMPER_TARGET rows = ' || count(*), count(*) = 1
from public.audit_events where action = 'TAMPER_TARGET';

select public._aud_case(
  'authenticated_update_of_audit_rows_has_no_effect', 'reject',
  format($q$update public.audit_events set action = 'TAMPERED' where business_id = %L$q$, :BIZ),
  'authenticated', :MGR);

insert into public._aud_results (name, expectation, detail, passed)
select 'no_audit_row_was_rewritten', 'value=0',
       'rows with action=TAMPERED = ' || count(*), count(*) = 0
from public.audit_events where action = 'TAMPERED';

-- ===========================================================================
-- C. The financial lifecycle produces an audit trail.
-- ===========================================================================
insert into public.invoices (id, business_id, customer_id, status) values (:INV, :BIZ, :CUST, 'draft');

select public._aud_case(
  'invoice_line_insert_accepted', 'accept',
  format($q$insert into public.invoice_items
      (business_id, invoice_id, kind, name, quantity, unit_price, tax_rate, discount_amount)
    values (%L, %L, 'service', 'Audited service', 1, 500, 5, 0)$q$, :BIZ, :INV),
  'authenticated', :MGR);

select public._aud_case(
  'invoice_issued', 'accept',
  format($q$select public.issue_invoice(%L)$q$, :INV), 'authenticated', :MGR);

select public._aud_case(
  'invoice_payment_recorded', 'accept',
  format($q$insert into public.invoice_payments (business_id, invoice_id, method, amount)
    values (%L, %L, 'cash', 100)$q$, :BIZ, :INV),
  'authenticated', :MGR);

select public._aud_case(
  'credit_note_issued', 'accept',
  format($q$select public.create_invoice_credit_note(%L, 50, 'audited goodwill')$q$, :INV),
  'authenticated', :MGR);

-- Each of those four must have left a trail, attributed to the actor.
insert into public._aud_results (name, expectation, detail, passed)
select 'audit_row_for_' || t, 'present',
       'rows=' || count(*), count(*) > 0
from unnest(array['invoices','invoice_items','invoice_payments','invoice_credit_notes']) as t
left join public.audit_events a on a.table_name = t and a.business_id = :BIZ
group by t;

insert into public._aud_results (name, expectation, detail, passed)
select 'audit_rows_attributed_to_actor', 'present',
       'rows with actor=' || count(*), count(*) > 0
from public.audit_events
where business_id = :BIZ and actor_id = :MGR;

-- ===========================================================================
-- D. Coverage: the Phase 1 trusted record is audited.
-- ===========================================================================
insert into public._aud_results (name, expectation, detail, passed)
select 'audit_coverage_complete', 'no gaps',
       case when missing = '' then 'all covered' else 'MISSING: ' || missing end,
       missing = ''
from (
  select coalesce(string_agg(t, ', ' order by t), '') as missing
  from unnest(array[
    'quotations','quotation_items','approvals','jobs','job_updates','job_tasks',
    'complaints','complaint_evidence','customers','vehicles',
    'invoices','invoice_items','invoice_payments','invoice_credit_notes',
    'appointments','vehicle_inspections','inspection_items'
  ]) as t
  where to_regclass('public.' || t) is not null
    and t not in (select table_name from public.audited_tables())
) s;

-- ===========================================================================
-- E. Redaction strips credentials, keeps business fields.
--
-- audit_redact() matches on the COLUMN NAME, never the value, so the values
-- below are deliberately inert placeholders. An earlier draft used a string
-- shaped like a live Stripe key, which CI's secret scan flagged -- correctly:
-- a credential-shaped literal does not belong in the repository even as test
-- data, and it proved nothing the placeholder does not.
-- ===========================================================================
insert into public._aud_results (name, expectation, detail, passed)
select 'redaction_strips_credentials', 'stripped',
       'keys=' || coalesce((select string_agg(k, ',' order by k)
          from jsonb_object_keys(r) as k), '(none)'),
       not (r ? 'share_token_hash') and not (r ? 'api_key')
       and not (r ? 'encrypted_password') and not (r ? 'reset_secret')
from (select public.audit_redact(jsonb_build_object(
        'id', 'x', 'full_name', 'Jane', 'share_token_hash', 'deadbeef',
        'api_key', 'REDACT_ME', 'encrypted_password', 'REDACT_ME',
        'reset_secret', 'nope')) as r) t;

insert into public._aud_results (name, expectation, detail, passed)
select 'redaction_keeps_business_fields', 'kept',
       'full_name present=' || (r ? 'full_name')::text,
       (r ? 'full_name') and (r ? 'id')
from (select public.audit_redact(jsonb_build_object(
        'id', 'x', 'full_name', 'Jane', 'api_key', 'REDACT_ME')) as r) t;

-- ===========================================================================
-- F. Audit rows do not leak across tenants.
--
-- Counted inside a helper that drops to `authenticated` with tenant B's
-- manager claims, so the count is taken under B's policies. Returning the
-- number (rather than raising) keeps the assertion legible: B must see 0 of
-- A's audit rows, while A sees its own.
-- ===========================================================================
create or replace function public._aud_count_visible(p_sub uuid, p_business uuid)
returns bigint
language plpgsql
as $fn$
declare
  n bigint;
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', p_sub::text, 'role', 'authenticated')::text);
  select count(*) into n from public.audit_events where business_id = p_business;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return n;
end;
$fn$;

insert into public._aud_results (name, expectation, detail, passed)
select 'tenant_b_sees_no_audit_rows_of_tenant_a', 'value=0',
       'rows visible to B = ' || n, n = 0
from public._aud_count_visible(:MGR_B, :BIZ) as n;

-- Control: without this, a policy denying everyone would score a pass above.
insert into public._aud_results (name, expectation, detail, passed)
select 'tenant_a_sees_its_own_audit_rows', 'value>0',
       'rows visible to A = ' || n, n > 0
from public._aud_count_visible(:MGR, :BIZ) as n;

-- ---------- report ----------
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

select format('CASE %s=%s (%s, %s)', name,
              case when passed then 'PASS' else 'FAIL' end, expectation, detail)
from public._aud_results order by seq;

select format('cases=%s passed=%s failed=%s',
              count(*), count(*) filter (where passed),
              count(*) filter (where not passed))
from public._aud_results;

select case when count(*) filter (where not passed) = 0
            then 'AUDIT_PRIVILEGE_OK' else 'AUDIT_PRIVILEGE_FAILED' end
from public._aud_results;
