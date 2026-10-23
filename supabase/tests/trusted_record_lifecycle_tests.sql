\set ON_ERROR_STOP off
\pset pager off
\set QUIET on

-- ============================================================================
-- Phase 1 trusted record — end-to-end lifecycle harness
--
-- WHAT THIS PROVES
-- Phase 1's objective is that ONE service journey can be reconstructed from
-- customer through complaint resolution, with the vehicle linked throughout.
-- This file builds that journey with real roles against a real database and
-- then reconstructs it in a single join, asserting at every hop that the
-- tenant, the customer and the vehicle still agree.
--
--   Customer -> Vehicle -> Inspection -> Quotation -> Approval -> Appointment
--   -> Job -> Performed work -> Invoice -> Payment -> Delivery -> Warranty
--   -> Complaint -> Resolution
--
-- It also proves the two distinctions Phase 1 turns on:
--   * performed work is distinguishable from merely quoted work;
--   * a warranty is a coverage record, not wording.
--
-- HOW TO RUN (from apps/web)
--   node scripts/db-test.mjs --reset --run ../../supabase/tests/trusted_record_lifecycle_tests.sql
--
-- Positive control (before 0043 the chain cannot be built at all -- jobs have
-- no vehicle_id, and neither performed work nor warranties exist):
--   node scripts/db-test.mjs --reset --up-to 0042 --run ../../supabase/tests/trusted_record_lifecycle_tests.sql
--
-- NEVER RUN THIS AGAINST PRODUCTION.
-- ============================================================================

\set BIZ '''f3cc0ce0-0001-4a00-8000-000000000001'''
\set BIZ_B '''f3cc0ce0-0002-4a00-8000-000000000002'''
\set OWNER '''f3cc0ce0-1001-4a00-8000-000000000001'''
\set PORTAL '''f3cc0ce0-1002-4a00-8000-000000000002'''
\set OWNER_B '''f3cc0ce0-1003-4a00-8000-000000000003'''
\set CUST '''f3cc0ce0-2001-4a00-8000-000000000001'''
\set CUST_B '''f3cc0ce0-2002-4a00-8000-000000000002'''
\set VEH '''f3cc0ce0-2501-4a00-8000-000000000001'''
\set BRANCH '''f3cc0ce0-2601-4a00-8000-000000000001'''
\set QUOTE '''f3cc0ce0-3001-4a00-8000-000000000001'''
\set QITEM '''f3cc0ce0-3501-4a00-8000-000000000001'''
\set JOB_B '''f3cc0ce0-5002-4a00-8000-000000000002'''

\set ON_ERROR_STOP on
do $preflight$
declare
  missing text;
begin
  select string_agg(t, ', ') into missing
  from unnest(array['job_performed_items','warranties']) as t
  where to_regclass('public.' || t) is null;
  if missing is not null then
    raise exception
      'trusted-record schema missing (%). Apply migrations through 0043.', missing;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='jobs' and column_name='vehicle_id'
  ) then
    raise exception 'jobs.vehicle_id missing. Apply migrations through 0043.';
  end if;
end
$preflight$;

drop table if exists public._trr_results;
create table public._trr_results (
  seq serial primary key,
  name text not null,
  expectation text not null,
  detail text,
  passed boolean not null
);

create or replace function public._trr_try(p_sql text, p_sub uuid)
returns text
language plpgsql
as $fn$
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
  perform set_config('request.jwt.claims', '', true);
  return state;
end;
$fn$;

create or replace function public._trr_case(
  p_name text, p_expect text, p_sql text, p_sub uuid
) returns void
language plpgsql
as $fn$
declare
  state text;
begin
  state := public._trr_try(p_sql, p_sub);
  insert into public._trr_results (name, expectation, detail, passed)
  values (p_name, p_expect,
          case when state = '00000' then 'accepted' else 'refused ' || state end,
          case when p_expect = 'reject' then state <> '00000' else state = '00000' end);
end;
$fn$;

create or replace function public._trr_link(p_name text, p_ok boolean, p_detail text)
returns void
language sql
as $fn$
  insert into public._trr_results (name, expectation, detail, passed)
  values (p_name, 'linked', p_detail, coalesce(p_ok, false));
$fn$;

-- ---------- fixtures ----------
set session_replication_role = replica;
do $teardown$
declare
  t text;
  fixture uuid[] := array[
    'f3cc0ce0-0001-4a00-8000-000000000001',
    'f3cc0ce0-0002-4a00-8000-000000000002'
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
delete from auth.users where id in (:OWNER, :PORTAL, :OWNER_B);
set session_replication_role = origin;

insert into auth.users (id, email, email_confirmed_at) values
  (:OWNER, 'owner@trr.test', now()),
  (:PORTAL, 'portal@trr.test', now()),
  (:OWNER_B, 'owner-b@trr.test', now());

insert into public.businesses (id, name, trn) values
  (:BIZ, 'TRR Workshop', '100000000000003'),
  (:BIZ_B, 'TRR Rival', '100000000000004');
insert into public.business_members (business_id, user_id, role, is_active) values
  (:BIZ, :OWNER, 'business_owner', true),
  (:BIZ_B, :OWNER_B, 'business_owner', true);

-- CUSTOMER -> VEHICLE
insert into public.customers (id, business_id, app_user_id, full_name)
values (:CUST, :BIZ, :PORTAL, 'Trusted Customer'),
       (:CUST_B, :BIZ_B, null, 'Rival Customer');
insert into public.vehicles (id, business_id, customer_id, make, model, year, plate_number)
values (:VEH, :BIZ, :CUST, 'Toyota', 'Hilux', 2021, 'TRR-001');

-- appointments.branch_id is NOT NULL, so the journey needs a branch.
insert into public.branches (id, business_id, name)
values (:BRANCH, :BIZ, 'TRR Main Branch');

-- A quotation for that customer and vehicle, with one line item.
insert into public.quotations
  (id, business_id, customer_id, vehicle_id, quote_number, status, current_version, language)
values (:QUOTE, :BIZ, :CUST, :VEH, 'Q-TRR-1', 'sent', 1, 'en');
insert into public.quotation_items
  (id, business_id, quotation_id, kind, name, quantity, unit_price, tax_rate, discount_amount)
values (:QITEM, :BIZ, :QUOTE, 'part', 'Brake pads (quoted)', 2, 150, 5, 0);

-- Tenant B's job, for the cross-tenant checks at the end.
insert into public.jobs (id, business_id, customer_id, status, title)
values (:JOB_B, :BIZ_B, :CUST_B, 'approved', 'Rival job');

\set ON_ERROR_STOP off

-- ===========================================================================
-- 1. APPROVAL via the canonical path, which creates the JOB.
-- ===========================================================================
select public._trr_case(
  'customer_approves_via_canonical_rpc', 'accept',
  format($q$select public.submit_quote_approval(
      %L, 1, 'en', 'I acknowledge the parts, pricing and terms.', 'Trusted Customer')$q$,
    :QUOTE),
  :PORTAL);

-- The approvals trigger creates the job. Give it the vehicle, which is what
-- 0043 made possible -- before it, a job could not name a vehicle at all.
update public.jobs j
  set vehicle_id = q.vehicle_id
from public.quotations q
where j.quotation_id = q.id and j.business_id = q.business_id and j.vehicle_id is null;

-- ===========================================================================
-- 2. INSPECTION attached to the same customer and vehicle.
-- ===========================================================================
select public._trr_case(
  'inspection_created_for_vehicle', 'accept',
  format($q$select public.create_inspection(
      %L, %L, %L, 'pre_quote'::public.inspection_context,
      (select id from public.inspection_templates where business_id = %L limit 1),
      null, null, 45000)$q$,
    :BIZ, :CUST, :VEH, :BIZ),
  :OWNER);

-- ===========================================================================
-- 3. APPOINTMENT for the same vehicle.
-- ===========================================================================
select public._trr_case(
  'appointment_booked', 'accept',
  format($q$insert into public.appointments
      (business_id, branch_id, customer_id, vehicle_id, quotation_id, status,
       requested_start, requested_end)
    values (%L, %L, %L, %L, %L, 'requested', now() + interval '1 day',
            now() + interval '1 day 2 hours')$q$,
    :BIZ, :BRANCH, :CUST, :VEH, :QUOTE),
  :OWNER);

-- ===========================================================================
-- 4. PERFORMED WORK -- and the distinction from quoted work.
--
-- One line traces back to the quote; a second has no source, i.e. extra work
-- discovered during the job. That asymmetry is the point of the table.
-- ===========================================================================
select public._trr_case(
  'performed_item_from_quote', 'accept',
  format($q$insert into public.job_performed_items
      (business_id, job_id, source_quotation_item_id, kind, name, quantity, unit_price, performed_by)
    values (%L, (select id from public.jobs where quotation_id = %L), %L,
            'part', 'Brake pads (fitted)', 2, 150, %L)$q$,
    :BIZ, :QUOTE, :QITEM, :OWNER),
  :OWNER);

select public._trr_case(
  'performed_item_not_quoted', 'accept',
  format($q$insert into public.job_performed_items
      (business_id, job_id, kind, name, quantity, unit_price, notes, performed_by)
    values (%L, (select id from public.jobs where quotation_id = %L),
            'labor', 'Caliper clean (unquoted extra)', 1, 80,
            'found seized during fitting', %L)$q$,
    :BIZ, :QUOTE, :OWNER),
  :OWNER);

insert into public._trr_results (name, expectation, detail, passed)
select 'performed_work_distinguishable_from_quoted', 'value=1 extra',
       'performed=' || count(*) || ' traced_to_quote=' || count(source_quotation_item_id)
       || ' extra=' || (count(*) - count(source_quotation_item_id)),
       count(*) = 2 and count(source_quotation_item_id) = 1
from public.job_performed_items
where business_id = :BIZ;

-- ===========================================================================
-- 5. COMPLETION and DELIVERY.
-- ===========================================================================
select public._trr_case(
  'job_completed_and_delivered', 'accept',
  format($q$update public.jobs
      set status = 'completed', completed_at = now(), completed_by = %L,
          delivered_at = now(), delivered_by = %L,
          delivery_notes = 'collected by customer'
      where quotation_id = %L$q$, :OWNER, :OWNER, :QUOTE),
  :OWNER);

select public._trr_case(
  'delivery_before_completion_refused', 'reject',
  format($q$update public.jobs
      set delivered_at = now() - interval '2 days'
      where quotation_id = %L$q$, :QUOTE),
  :OWNER);

-- ===========================================================================
-- 6. INVOICE and PAYMENT for the same job.
-- ===========================================================================
select public._trr_case(
  'invoice_raised_for_job', 'accept',
  format($q$insert into public.invoices
      (business_id, customer_id, vehicle_id, quotation_id, job_id, status)
    values (%L, %L, %L, %L, (select id from public.jobs where quotation_id = %L), 'draft')$q$,
    :BIZ, :CUST, :VEH, :QUOTE, :QUOTE),
  :OWNER);

select public._trr_case(
  'invoice_line_added', 'accept',
  format($q$insert into public.invoice_items
      (business_id, invoice_id, kind, name, quantity, unit_price, tax_rate, discount_amount)
    values (%L, (select id from public.invoices where quotation_id = %L),
            'part', 'Brake pads', 2, 150, 5, 0)$q$,
    :BIZ, :QUOTE),
  :OWNER);

select public._trr_case(
  'invoice_issued', 'accept',
  format($q$select public.issue_invoice((select id from public.invoices where quotation_id = %L))$q$,
    :QUOTE),
  :OWNER);

select public._trr_case(
  'payment_settles_invoice', 'accept',
  format($q$insert into public.invoice_payments (business_id, invoice_id, method, amount)
    values (%L, (select id from public.invoices where quotation_id = %L), 'online_card', 315)$q$,
    :BIZ, :QUOTE),
  :OWNER);

insert into public._trr_results (name, expectation, detail, passed)
select 'invoice_settled_exactly', 'value=0',
       'total=' || total || ' paid=' || amount_paid || ' balance=' || balance_due,
       balance_due = 0 and status = 'paid'
from public.invoices where quotation_id = :QUOTE;

-- ===========================================================================
-- 7. WARRANTY as a coverage record.
-- ===========================================================================
select public._trr_case(
  'warranty_issued_for_performed_part', 'accept',
  format($q$insert into public.warranties
      (business_id, customer_id, vehicle_id, job_id, invoice_id, performed_item_id,
       scope, terms, coverage_start, coverage_months, coverage_mileage, created_by)
    values (%L, %L, %L,
            (select id from public.jobs where quotation_id = %L),
            (select id from public.invoices where quotation_id = %L),
            (select id from public.job_performed_items
               where business_id = %L and source_quotation_item_id is not null),
            'Brake pads and fitting', '12 months or 20,000 km, whichever first',
            current_date, 12, 20000, %L)$q$,
    :BIZ, :CUST, :VEH, :QUOTE, :QUOTE, :BIZ, :OWNER),
  :OWNER);

-- Wording alone is not a warranty: a row must commit to a measurable period.
select public._trr_case(
  'warranty_without_any_duration_refused', 'reject',
  format($q$insert into public.warranties
      (business_id, customer_id, vehicle_id, scope, terms, coverage_start)
    values (%L, %L, %L, 'vague', 'we will look after you', current_date)$q$,
    :BIZ, :CUST, :VEH),
  :OWNER);

-- ===========================================================================
-- 8. COMPLAINT tied to the originating context, then RESOLUTION.
-- ===========================================================================
select public._trr_case(
  'complaint_links_full_context', 'accept',
  format($q$insert into public.complaints
      (business_id, customer_id, vehicle_id, quotation_id, job_id, invoice_id,
       category, status, severity, subject, description)
    values (%L, %L, %L, %L,
            (select id from public.jobs where quotation_id = %L),
            (select id from public.invoices where quotation_id = %L),
            'workmanship', 'open', 'high', 'Noise after brake service',
            'Squealing under braking two days after collection')$q$,
    :BIZ, :CUST, :VEH, :QUOTE, :QUOTE, :QUOTE),
  :OWNER);

select public._trr_case(
  'warranty_invoked_against_complaint', 'accept',
  format($q$update public.warranties
      set invoked_at = now(), invoked_reason = 'brake noise',
          status = 'claimed',
          complaint_id = (select id from public.complaints where business_id = %L)
      where business_id = %L$q$, :BIZ, :BIZ),
  :OWNER);

select public._trr_case(
  'complaint_resolved', 'accept',
  format($q$update public.complaints
      set status = 'resolved', resolved_at = now(),
          resolution_summary = 'Pads re-bedded under warranty; no charge'
      where business_id = %L$q$, :BIZ),
  :OWNER);

-- ===========================================================================
-- 9. RECONSTRUCTION. One join, every hop, tenant/customer/vehicle consistent.
-- ===========================================================================
do $reconstruct$
declare
  r record;
begin
  select
    c.id as customer_id, v.id as vehicle_id, i.id as inspection_id,
    q.id as quotation_id, a.id as approval_id, ap.id as appointment_id,
    j.id as job_id, j.vehicle_id as job_vehicle_id,
    j.completed_at, j.delivered_at,
    pi.id as performed_id, inv.id as invoice_id, p.id as payment_id,
    w.id as warranty_id, cm.id as complaint_id, cm.resolved_at,
    -- every hop must agree on the tenant
    (c.business_id = v.business_id and v.business_id = q.business_id
     and q.business_id = j.business_id and j.business_id = inv.business_id
     and inv.business_id = w.business_id and w.business_id = cm.business_id) as tenant_consistent,
    -- and on the customer
    (v.customer_id = c.id and q.customer_id = c.id and j.customer_id = c.id
     and inv.customer_id = c.id and w.customer_id = c.id and cm.customer_id = c.id) as customer_consistent,
    -- and on the vehicle, which is the link Phase 1 turns on
    (q.vehicle_id = v.id and j.vehicle_id = v.id and inv.vehicle_id = v.id
     and w.vehicle_id = v.id and cm.vehicle_id = v.id and i.vehicle_id = v.id) as vehicle_consistent
  into r
  from public.customers c
  join public.vehicles v on v.customer_id = c.id
  join public.vehicle_inspections i on i.vehicle_id = v.id
  join public.quotations q on q.vehicle_id = v.id
  join public.approvals a on a.quotation_id = q.id
  join public.appointments ap on ap.quotation_id = q.id
  join public.jobs j on j.quotation_id = q.id
  join public.job_performed_items pi on pi.job_id = j.id and pi.source_quotation_item_id is not null
  join public.invoices inv on inv.job_id = j.id
  join public.invoice_payments p on p.invoice_id = inv.id
  join public.warranties w on w.job_id = j.id
  join public.complaints cm on cm.job_id = j.id
  where c.id = 'f3cc0ce0-2001-4a00-8000-000000000001'
  limit 1;

  if r.customer_id is null then
    perform public._trr_link('lifecycle_reconstructs_end_to_end', false,
      'the full chain could not be joined');
    return;
  end if;

  perform public._trr_link('lifecycle_reconstructs_end_to_end', true,
    'customer -> vehicle -> inspection -> quote -> approval -> appointment -> job -> performed -> invoice -> payment -> warranty -> complaint');
  perform public._trr_link('lifecycle_tenant_consistent', r.tenant_consistent,
    'tenant agrees at every hop');
  perform public._trr_link('lifecycle_customer_consistent', r.customer_consistent,
    'customer agrees at every hop');
  perform public._trr_link('lifecycle_vehicle_consistent', r.vehicle_consistent,
    'vehicle agrees at every hop');
  perform public._trr_link('lifecycle_job_has_vehicle', r.job_vehicle_id is not null,
    'job.vehicle_id = ' || coalesce(r.job_vehicle_id::text, 'NULL'));
  perform public._trr_link('lifecycle_completion_recorded', r.completed_at is not null,
    'completed_at set');
  perform public._trr_link('lifecycle_delivery_recorded', r.delivered_at is not null,
    'delivered_at set');
  perform public._trr_link('lifecycle_resolution_recorded', r.resolved_at is not null,
    'complaint resolved_at set');
end
$reconstruct$;

-- Material actions across the journey are attributable and timestamped.
insert into public._trr_results (name, expectation, detail, passed)
select 'lifecycle_actions_audited', 'value>=8',
       'distinct audited tables in this journey = ' || count(distinct table_name),
       count(distinct table_name) >= 8
from public.audit_events where business_id = :BIZ;

-- ===========================================================================
-- 10. The new tables honour tenant isolation (APPSEC-18 applied to 0043).
-- ===========================================================================
select public._trr_case(
  'performed_item_cross_tenant_job_refused', 'reject',
  format($q$insert into public.job_performed_items
      (business_id, job_id, kind, name, quantity, unit_price)
    values (%L, %L, 'part', 'injected', 1, 1)$q$, :BIZ, :JOB_B),
  :OWNER);

select public._trr_case(
  'warranty_cross_tenant_customer_refused', 'reject',
  format($q$insert into public.warranties
      (business_id, customer_id, scope, coverage_start, coverage_months)
    values (%L, %L, 'forged', current_date, 12)$q$, :BIZ, :CUST_B),
  :OWNER);

-- Visibility is asserted by COUNTING under the other party's policies, not by
-- raising inside a DO block: a query that legitimately sees zero rows does not
-- raise, so the raise-based form reported "accepted" for the very outcome it
-- was meant to confirm.
create or replace function public._trr_visible(p_sub uuid, p_sql text)
returns bigint
language plpgsql
as $fn$
declare
  n bigint;
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', p_sub::text, 'role', 'authenticated')::text);
  execute p_sql into n;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return n;
end;
$fn$;

insert into public._trr_results (name, expectation, detail, passed)
select 'rival_sees_none_of_our_warranties', 'value=0', 'rows visible to rival = ' || n, n = 0
from public._trr_visible(:OWNER_B,
  format('select count(*) from public.warranties where business_id = %L', :BIZ)) as n;

insert into public._trr_results (name, expectation, detail, passed)
select 'customer_sees_own_warranty', 'value>0', 'rows visible to customer = ' || n, n > 0
from public._trr_visible(:PORTAL,
  format('select count(*) from public.warranties where customer_id = %L', :CUST)) as n;

insert into public._trr_results (name, expectation, detail, passed)
select 'customer_sees_no_performed_work', 'value=0', 'rows visible to customer = ' || n, n = 0
from public._trr_visible(:PORTAL,
  format('select count(*) from public.job_performed_items where business_id = %L', :BIZ)) as n;

insert into public._trr_results (name, expectation, detail, passed)
select 'staff_see_own_performed_work', 'value>0', 'rows visible to staff = ' || n, n > 0
from public._trr_visible(:OWNER,
  format('select count(*) from public.job_performed_items where business_id = %L', :BIZ)) as n;

-- ---------- report ----------
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

select format('CASE %s=%s (%s, %s)', name,
              case when passed then 'PASS' else 'FAIL' end, expectation, detail)
from public._trr_results order by seq;

select format('cases=%s passed=%s failed=%s',
              count(*), count(*) filter (where passed),
              count(*) filter (where not passed))
from public._trr_results;

select case when count(*) filter (where not passed) = 0
            then 'TRUSTED_RECORD_OK' else 'TRUSTED_RECORD_FAILED' end
from public._trr_results;
