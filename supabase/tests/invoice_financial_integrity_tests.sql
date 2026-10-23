\set ON_ERROR_STOP off
\pset pager off
\set QUIET on

-- ============================================================================
-- Invoice financial integrity — database security harness
--
-- WHAT THIS PROVES
-- The four invoice header money columns (subtotal, discount_total, tax_total,
-- total) were maintained only by recomputeTotals() in the dashboard server
-- action, while 0003_api_grants.sql grants INSERT/UPDATE/DELETE on
-- invoice_items to `authenticated`. A manager posting at PostgREST could
-- therefore change a line and leave the header -- and balance_due, generated
-- from total -- stale. Payments had no ceiling, so overpayment drove
-- balance_due negative while the status read `paid`. Credit notes had no
-- ceiling at all.
--
-- Migration 0041 is the fix; this file is its regression gate.
--
-- HOW TO RUN (from apps/web)
--   node scripts/db-test.mjs --reset --run ../../supabase/tests/invoice_financial_integrity_tests.sql
--
-- Positive control -- against the pre-fix schema the drift and overpayment
-- cases must FAIL, which is what proves this file is exercising anything:
--   node scripts/db-test.mjs --reset --up-to 0040 --run ../../supabase/tests/invoice_financial_integrity_tests.sql
--
-- Every mutation runs as `authenticated` with a manager's JWT claims, never as
-- the table owner: `postgres` owns these tables and both RLS and the
-- application are bypassed for an owner, so a test that forgot to drop
-- privileges would prove nothing about the real write path.
--
-- NEVER RUN THIS AGAINST PRODUCTION.
-- ============================================================================

\set BIZ '''f1aa0ce0-0001-4a00-8000-000000000001'''
\set MGR '''f1aa0ce0-1001-4a00-8000-000000000001'''
\set CUST '''f1aa0ce0-2001-4a00-8000-000000000001'''
\set INV '''f1aa0ce0-3001-4a00-8000-000000000001'''
\set INV2 '''f1aa0ce0-3002-4a00-8000-000000000002'''
\set ITEM '''f1aa0ce0-4001-4a00-8000-000000000001'''

\set ON_ERROR_STOP on
do $preflight$
begin
  if to_regclass('public.invoice_items') is null
     or to_regclass('public.invoice_credit_notes') is null then
    raise exception 'invoicing schema missing. Apply migrations through 0034 first.';
  end if;
end
$preflight$;

-- ---------- ledger + driver (same shape as tenant_parent_integrity_tests) ----------
drop table if exists public._fin_results;
create table public._fin_results (
  seq serial primary key,
  name text not null,
  expectation text not null,
  detail text,
  passed boolean not null
);

create or replace function public._fin_try(p_sql text, p_sub uuid)
returns text
language plpgsql
as $$
declare
  state text := '00000';
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', p_sub::text, 'role', 'authenticated')::text);
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

create or replace function public._fin_case(
  p_name text, p_expect text, p_sql text, p_sub uuid
) returns void
language plpgsql
as $$
declare
  state text;
begin
  state := public._fin_try(p_sql, p_sub);
  insert into public._fin_results (name, expectation, detail, passed)
  values (
    p_name, p_expect,
    case when state = '00000' then 'accepted' else 'refused ' || state end,
    case when p_expect = 'reject' then state <> '00000' else state = '00000' end
  );
end;
$$;

-- Asserts a measured value, so a trigger that silently stops firing is caught.
create or replace function public._fin_expect(
  p_name text, p_actual numeric, p_expected numeric
) returns void
language plpgsql
as $$
begin
  insert into public._fin_results (name, expectation, detail, passed)
  values (p_name, 'value=' || p_expected,
          'actual=' || coalesce(p_actual::text, 'null'),
          p_actual is not null and p_actual = p_expected);
end;
$$;

-- ---------- fixtures ----------
set session_replication_role = replica;
do $teardown$
declare
  t text;
  fixture uuid[] := array['f1aa0ce0-0001-4a00-8000-000000000001']::uuid[];
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
delete from auth.users where id = :MGR;
set session_replication_role = origin;

insert into auth.users (id, email, email_confirmed_at)
values (:MGR, 'mgr@finance.test', now());

-- TRN is required before issue_invoice() will number an invoice.
insert into public.businesses (id, name, trn) values (:BIZ, 'Finance Tenant', '100000000000003');
insert into public.business_members (business_id, user_id, role, is_active)
values (:BIZ, :MGR, 'manager', true);
insert into public.customers (id, business_id, full_name) values (:CUST, :BIZ, 'Finance Customer');
insert into public.invoices (id, business_id, customer_id, status) values (:INV, :BIZ, :CUST, 'draft');

\set ON_ERROR_STOP off

-- ===========================================================================
-- A. HEADER TOTALS FOLLOW THE LINES, on the raw table path.
--
-- 2 x 100 with a 50 discount and 5% VAT:
--   subtotal 200, discount 50, net 150, tax 7.50, total 157.50
-- ===========================================================================
select public._fin_case(
  'line_insert_accepted', 'accept',
  format($q$insert into public.invoice_items
      (id, business_id, invoice_id, kind, name, quantity, unit_price, tax_rate, discount_amount)
    values (%L, %L, %L, 'service', 'Brake service', 2, 100, 5, 50)$q$,
    :ITEM, :BIZ, :INV),
  :MGR);

select public._fin_expect('header_subtotal_after_insert', subtotal, 200.00) from public.invoices where id = :INV;
select public._fin_expect('header_discount_after_insert', discount_total, 50.00) from public.invoices where id = :INV;
select public._fin_expect('header_tax_after_insert', tax_total, 7.50) from public.invoices where id = :INV;
select public._fin_expect('header_total_after_insert', total, 157.50) from public.invoices where id = :INV;
select public._fin_expect('line_total_is_derived', total, 157.50) from public.invoice_items where id = :ITEM;
select public._fin_expect('balance_due_after_insert', balance_due, 157.50) from public.invoices where id = :INV;

-- A line total supplied by the client is overwritten, not trusted.
select public._fin_case(
  'client_supplied_line_total_ignored', 'accept',
  format($q$update public.invoice_items set total = 999999 where id = %L$q$, :ITEM),
  :MGR);
select public._fin_expect('line_total_still_derived', total, 157.50) from public.invoice_items where id = :ITEM;

-- Re-price the line: the header must follow. 3 x 200, no discount, 5% VAT
--   subtotal 600, tax 30, total 630
select public._fin_case(
  'line_update_accepted', 'accept',
  format($q$update public.invoice_items
      set quantity = 3, unit_price = 200, discount_amount = 0 where id = %L$q$, :ITEM),
  :MGR);
select public._fin_expect('header_subtotal_after_update', subtotal, 600.00) from public.invoices where id = :INV;
select public._fin_expect('header_total_after_update', total, 630.00) from public.invoices where id = :INV;

-- ===========================================================================
-- B. PAYMENT CEILING.
-- ===========================================================================
-- Issue the invoice so it is payable, through the RPC that owns numbering.
select public._fin_case(
  'issue_invoice_accepted', 'accept',
  format($q$select public.issue_invoice(%L)$q$, :INV),
  :MGR);

select public._fin_case(
  'partial_payment_accepted', 'accept',
  format($q$insert into public.invoice_payments (business_id, invoice_id, method, amount)
    values (%L, %L, 'cash', 130)$q$, :BIZ, :INV),
  :MGR);
select public._fin_expect('amount_paid_after_partial', amount_paid, 130.00) from public.invoices where id = :INV;
select public._fin_expect('balance_due_after_partial', balance_due, 500.00) from public.invoices where id = :INV;

-- 630 owed, 130 paid: 600 more must be refused.
select public._fin_case(
  'overpayment_refused', 'reject',
  format($q$insert into public.invoice_payments (business_id, invoice_id, method, amount)
    values (%L, %L, 'cash', 600)$q$, :BIZ, :INV),
  :MGR);

select public._fin_case(
  'negative_payment_refused', 'reject',
  format($q$insert into public.invoice_payments (business_id, invoice_id, method, amount)
    values (%L, %L, 'cash', -10)$q$, :BIZ, :INV),
  :MGR);

-- Settling exactly is allowed and lands on `paid` with a zero balance.
select public._fin_case(
  'exact_settlement_accepted', 'accept',
  format($q$insert into public.invoice_payments (business_id, invoice_id, method, amount)
    values (%L, %L, 'cash', 500)$q$, :BIZ, :INV),
  :MGR);
select public._fin_expect('balance_due_after_settlement', balance_due, 0.00) from public.invoices where id = :INV;

insert into public._fin_results (name, expectation, detail, passed)
select 'status_paid_after_settlement', 'paid', 'status=' || status, status = 'paid'
from public.invoices where id = :INV;

-- balance_due must never be negative on any invoice in the fixture tenant.
insert into public._fin_results (name, expectation, detail, passed)
select 'no_negative_balance_anywhere', 'reject',
       'invoices with balance_due < 0 = ' || count(*), count(*) = 0
from public.invoices where business_id = :BIZ and balance_due < 0;

-- ===========================================================================
-- C. ISSUED INVOICES ARE NOT REWRITTEN.
-- ===========================================================================
select public._fin_case(
  'line_edit_on_issued_invoice_refused', 'reject',
  format($q$update public.invoice_items set unit_price = 1 where id = %L$q$, :ITEM),
  :MGR);

select public._fin_case(
  'line_delete_on_issued_invoice_refused', 'reject',
  format($q$delete from public.invoice_items where id = %L$q$, :ITEM),
  :MGR);

select public._fin_case(
  'line_insert_on_issued_invoice_refused', 'reject',
  format($q$insert into public.invoice_items
      (business_id, invoice_id, kind, name, quantity, unit_price, tax_rate, discount_amount)
    values (%L, %L, 'part', 'sneaked in', 1, 1000, 0, 0)$q$, :BIZ, :INV),
  :MGR);

select public._fin_expect('issued_total_unchanged', total, 630.00) from public.invoices where id = :INV;

-- ===========================================================================
-- D. CREDIT-NOTE CEILING.
-- ===========================================================================
select public._fin_case(
  'credit_note_within_total_accepted', 'accept',
  format($q$select public.create_invoice_credit_note(%L, 100, 'goodwill')$q$, :INV),
  :MGR);

-- 630 total, 100 credited: 600 more must be refused.
select public._fin_case(
  'credit_note_beyond_total_refused', 'reject',
  format($q$select public.create_invoice_credit_note(%L, 600, 'too much')$q$, :INV),
  :MGR);

select public._fin_case(
  'credit_note_negative_refused', 'reject',
  format($q$select public.create_invoice_credit_note(%L, -5, 'negative')$q$, :INV),
  :MGR);

insert into public._fin_results (name, expectation, detail, passed)
select 'cumulative_credit_within_total', 'reject',
       'credited=' || coalesce(sum(c.amount), 0) || ' of 630.00',
       coalesce(sum(c.amount), 0) <= 630.00
from public.invoice_credit_notes c where c.invoice_id = :INV;

-- ===========================================================================
-- E. DRIFT CANNOT BE REINTRODUCED BY HAND.
--
-- A manager writing header totals directly must not be able to leave them
-- disagreeing with the lines: the next line write rebuilds them, and the
-- amount_paid ceiling constraint rejects an impossible paid figure outright.
-- ===========================================================================
insert into public.invoices (id, business_id, customer_id, status)
values (:INV2, :BIZ, :CUST, 'draft');

select public._fin_case(
  'drafted_line_for_drift_check', 'accept',
  format($q$insert into public.invoice_items
      (business_id, invoice_id, kind, name, quantity, unit_price, tax_rate, discount_amount)
    values (%L, %L, 'service', 'Oil change', 1, 100, 0, 0)$q$, :BIZ, :INV2),
  :MGR);
select public._fin_expect('drift_invoice_total', total, 100.00) from public.invoices where id = :INV2;

select public._fin_case(
  'manual_amount_paid_above_total_refused', 'reject',
  format($q$update public.invoices set amount_paid = 99999 where id = %L$q$, :INV2),
  :MGR);

-- ---------- report ----------
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

select format('CASE %s=%s (%s, %s)', name,
              case when passed then 'PASS' else 'FAIL' end, expectation, detail)
from public._fin_results order by seq;

select format('cases=%s passed=%s failed=%s',
              count(*), count(*) filter (where passed),
              count(*) filter (where not passed))
from public._fin_results;

select case when count(*) filter (where not passed) = 0
            then 'INVOICE_INTEGRITY_OK'
            else 'INVOICE_INTEGRITY_FAILED' end
from public._fin_results;
