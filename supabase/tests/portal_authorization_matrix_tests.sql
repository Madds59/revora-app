\set ON_ERROR_STOP off
\pset pager off
\set QUIET on

-- ============================================================================
-- Customer portal authorization matrix — database security harness
--
-- WHAT THIS PROVES
-- For every portal-visible entity, a portal customer sees their OWN records
-- and nothing else:
--
--   own rows            must be > 0   (the control -- without it, a policy
--                                      that denied everything would pass)
--   same-tenant sibling must be 0     (customer A vs customer B in tenant A)
--   other tenant        must be 0     (customer A vs customer C in tenant B)
--   deactivated account must see 0    (a soft-deleted customer keeps no reach)
--
-- Measured under each actor's own session, with `role authenticated` and their
-- JWT claims, so the policies decide -- not the application. `postgres` owns
-- these tables and RLS does not apply to a table owner, so a test that forgot
-- to drop privileges would pass vacuously.
--
-- NOT COVERED HERE: the inspection share-link surface (expiry, revocation,
-- rotation, hash-only storage). supabase/tests/dvi_security_tests.sql already
-- covers that comprehensively and is the better place for it.
--
-- CAN THIS SUITE FAIL?
-- Unlike the other harnesses in this directory, this one verifies isolation
-- that was already sound rather than proving a fix, so "64/64 passing" on its
-- own would be weak evidence. It was leak-verified by temporarily adding an
-- over-broad policy to the test database:
--
--     create policy "zz_leak_probe" on public.vehicles for select using (true);
--
-- which immediately failed three cases -- same-tenant sibling, cross-tenant,
-- and the deactivated customer -- and passed again once dropped. Repeat that
-- if you ever doubt the matrix is actually looking.
--
-- HOW TO RUN (from apps/web)
--   node scripts/db-test.mjs --reset --run ../../supabase/tests/portal_authorization_matrix_tests.sql
--
-- NEVER RUN THIS AGAINST PRODUCTION.
-- ============================================================================

\set BIZ_A '''f6ff0ce0-0001-4a00-8000-000000000001'''
\set BIZ_B '''f6ff0ce0-0002-4a00-8000-000000000002'''
\set STAFF_A '''f6ff0ce0-1001-4a00-8000-000000000001'''
\set STAFF_B '''f6ff0ce0-1002-4a00-8000-000000000002'''
\set USER_A1 '''f6ff0ce0-1101-4a00-8000-000000000001'''
\set USER_A2 '''f6ff0ce0-1102-4a00-8000-000000000002'''
\set USER_B1 '''f6ff0ce0-1103-4a00-8000-000000000003'''
\set USER_GONE '''f6ff0ce0-1104-4a00-8000-000000000004'''
\set CUST_A1 '''f6ff0ce0-2101-4a00-8000-000000000001'''
\set CUST_A2 '''f6ff0ce0-2102-4a00-8000-000000000002'''
\set CUST_B1 '''f6ff0ce0-2103-4a00-8000-000000000003'''
\set CUST_GONE '''f6ff0ce0-2104-4a00-8000-000000000004'''
\set BRANCH_A '''f6ff0ce0-2601-4a00-8000-000000000001'''
\set BRANCH_B '''f6ff0ce0-2602-4a00-8000-000000000002'''

\set ON_ERROR_STOP on
do $preflight$
declare
  missing text;
begin
  select string_agg(t, ', ') into missing
  from unnest(array['warranties','invoice_payments','complaint_evidence','appointments']) as t
  where to_regclass('public.' || t) is null;
  if missing is not null then
    raise exception 'portal schema missing (%). Apply migrations through 0043.', missing;
  end if;
end
$preflight$;

drop table if exists public._pm_results;
create table public._pm_results (
  seq serial primary key,
  entity text not null,
  actor text not null,
  expectation text not null,
  observed bigint,
  passed boolean not null
);

-- Counts rows visible to a given subject under their own policies.
create or replace function public._pm_count(p_sub uuid, p_sql text)
returns bigint
language plpgsql
as $fn$
declare
  n bigint;
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', p_sub::text, 'role', 'authenticated')::text);
  begin
    execute p_sql into n;
  exception when others then
    -- A refusal counts as zero visibility, which is the property under test.
    n := 0;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return coalesce(n, 0);
end;
$fn$;

-- Seeds one complete portal-visible record set for a (business, customer).
create or replace function public._pm_seed(
  p_biz uuid, p_branch uuid, p_cust uuid, p_tag text
) returns void
language plpgsql
as $fn$
declare
  v_veh uuid; v_quote uuid; v_job uuid; v_inv uuid; v_comp uuid; v_media uuid;
begin
  insert into public.vehicles (business_id, customer_id, make, model, plate_number)
  values (p_biz, p_cust, 'Make', 'Model', p_tag || '-PLATE') returning id into v_veh;

  insert into public.quotations
    (business_id, customer_id, vehicle_id, quote_number, status, current_version, language)
  values (p_biz, p_cust, v_veh, 'Q-' || p_tag, 'sent', 1, 'en') returning id into v_quote;

  insert into public.quotation_items
    (business_id, quotation_id, kind, name, quantity, unit_price, tax_rate, discount_amount)
  values (p_biz, v_quote, 'part', p_tag || ' line', 1, 100, 5, 0);

  insert into public.approvals
    (business_id, quotation_id, customer_id, quotation_version, language, acknowledgement_text)
  values (p_biz, v_quote, p_cust, 1, 'en', p_tag || ' approved');

  -- The approvals trigger creates the job; fetch it rather than duplicating.
  select id into v_job from public.jobs where quotation_id = v_quote;
  update public.jobs set vehicle_id = v_veh where id = v_job;

  insert into public.job_updates
    (business_id, job_id, status, message, visible_to_customer)
  values (p_biz, v_job, 'approved', p_tag || ' update', true);

  insert into public.invoices
    (business_id, customer_id, vehicle_id, quotation_id, job_id, status)
  values (p_biz, p_cust, v_veh, v_quote, v_job, 'draft') returning id into v_inv;

  insert into public.invoice_items
    (business_id, invoice_id, kind, name, quantity, unit_price, tax_rate, discount_amount)
  values (p_biz, v_inv, 'part', p_tag || ' invoice line', 1, 100, 5, 0);

  insert into public.invoice_payments (business_id, invoice_id, method, amount)
  values (p_biz, v_inv, 'cash', 10);

  -- Issue it. invoice_items_customer_read deliberately hides the lines of a
  -- DRAFT invoice from the customer, so leaving it in draft would make "A1
  -- cannot see their own invoice lines" look like a bug when it is the rule.
  -- Items are added before this, because 0041 makes an issued invoice's lines
  -- immutable.
  update public.invoices set status = 'issued', issued_at = now(),
         invoice_number = 'INV-' || p_tag
   where id = v_inv;

  insert into public.complaints
    (business_id, customer_id, vehicle_id, job_id, invoice_id, category,
     status, severity, subject, description)
  values (p_biz, p_cust, v_veh, v_job, v_inv, 'workmanship',
          'open', 'low', p_tag || ' subject', p_tag || ' description')
  returning id into v_comp;

  insert into public.complaint_evidence (business_id, complaint_id)
  values (p_biz, v_comp);

  insert into public.warranties
    (business_id, customer_id, vehicle_id, job_id, invoice_id,
     scope, coverage_start, coverage_months)
  values (p_biz, p_cust, v_veh, v_job, v_inv, p_tag || ' warranty', current_date, 12);

  insert into public.appointments
    (business_id, branch_id, customer_id, vehicle_id, quotation_id, status,
     requested_start, requested_end)
  values (p_biz, p_branch, p_cust, v_veh, v_quote, 'requested',
          now() + interval '1 day', now() + interval '1 day 2 hours');

  -- documents.media_asset_id is NOT NULL, so the document needs an asset.
  insert into public.media_assets
    (business_id, bucket, object_path, file_name, mime_type, size_bytes, purpose)
  values (p_biz, 'revora-private', p_tag || '/doc.pdf', 'doc.pdf',
          'application/pdf', 1024, 'document')
  returning id into v_media;

  insert into public.documents
    (business_id, customer_id, job_id, quotation_id, complaint_id, media_asset_id,
     document_type, title)
  values (p_biz, p_cust, v_job, v_quote, v_comp, v_media,
          'invoice', p_tag || ' document');
end;
$fn$;

-- ---------- fixtures ----------
set session_replication_role = replica;
do $teardown$
declare
  t text;
  fixture uuid[] := array[
    'f6ff0ce0-0001-4a00-8000-000000000001',
    'f6ff0ce0-0002-4a00-8000-000000000002'
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
delete from auth.users where id in (:STAFF_A, :STAFF_B, :USER_A1, :USER_A2, :USER_B1, :USER_GONE);
set session_replication_role = origin;

insert into auth.users (id, email, email_confirmed_at) values
  (:STAFF_A, 'staff-a@portal.test', now()),
  (:STAFF_B, 'staff-b@portal.test', now()),
  (:USER_A1, 'a1@portal.test', now()),
  (:USER_A2, 'a2@portal.test', now()),
  (:USER_B1, 'b1@portal.test', now()),
  (:USER_GONE, 'gone@portal.test', now());

insert into public.businesses (id, name, trn) values
  (:BIZ_A, 'Portal Tenant A', '100000000000003'),
  (:BIZ_B, 'Portal Tenant B', '100000000000004');
insert into public.business_members (business_id, user_id, role, is_active) values
  (:BIZ_A, :STAFF_A, 'business_owner', true),
  (:BIZ_B, :STAFF_B, 'business_owner', true);
insert into public.branches (id, business_id, name) values
  (:BRANCH_A, :BIZ_A, 'A Main'), (:BRANCH_B, :BIZ_B, 'B Main');

insert into public.customers (id, business_id, app_user_id, full_name) values
  (:CUST_A1, :BIZ_A, :USER_A1, 'Customer A1'),
  (:CUST_A2, :BIZ_A, :USER_A2, 'Customer A2'),
  (:CUST_B1, :BIZ_B, :USER_B1, 'Customer B1'),
  (:CUST_GONE, :BIZ_A, :USER_GONE, 'Deactivated Customer');

select public._pm_seed(:BIZ_A, :BRANCH_A, :CUST_A1, 'A1');
select public._pm_seed(:BIZ_A, :BRANCH_A, :CUST_A2, 'A2');
select public._pm_seed(:BIZ_B, :BRANCH_B, :CUST_B1, 'B1');
select public._pm_seed(:BIZ_A, :BRANCH_A, :CUST_GONE, 'GONE');

-- Deactivate the fourth customer the way the product does: soft delete.
update public.customers set deleted_at = now() where id = :CUST_GONE;

\set ON_ERROR_STOP off

-- ===========================================================================
-- THE MATRIX
--
-- Each entity is counted three times under customer A1's session: their own
-- rows, their same-tenant sibling's, and another tenant's. The per-entity SQL
-- resolves ownership the way the schema does -- directly by customer_id, or
-- through the parent for the child tables.
-- ===========================================================================
do $matrix$
declare
  e record;
  sql_own text;
  n bigint;
  actor record;
begin
  for e in
    select * from (values
      ('vehicles',          'select count(*) from public.vehicles where customer_id = %L'),
      ('quotations',        'select count(*) from public.quotations where customer_id = %L'),
      ('quotation_items',   'select count(*) from public.quotation_items qi join public.quotations q on q.id = qi.quotation_id where q.customer_id = %L'),
      ('approvals',         'select count(*) from public.approvals where customer_id = %L'),
      ('jobs',              'select count(*) from public.jobs where customer_id = %L'),
      ('job_updates',       'select count(*) from public.job_updates ju join public.jobs j on j.id = ju.job_id where j.customer_id = %L'),
      ('invoices',          'select count(*) from public.invoices where customer_id = %L'),
      ('invoice_items',     'select count(*) from public.invoice_items ii join public.invoices i on i.id = ii.invoice_id where i.customer_id = %L'),
      ('invoice_payments',  'select count(*) from public.invoice_payments p join public.invoices i on i.id = p.invoice_id where i.customer_id = %L'),
      ('complaints',        'select count(*) from public.complaints where customer_id = %L'),
      ('complaint_evidence','select count(*) from public.complaint_evidence ce join public.complaints c on c.id = ce.complaint_id where c.customer_id = %L'),
      ('warranties',        'select count(*) from public.warranties where customer_id = %L'),
      ('appointments',      'select count(*) from public.appointments where customer_id = %L'),
      ('documents',         'select count(*) from public.documents where customer_id = %L')
    ) as t(entity, tmpl)
  loop
    -- own: must be visible
    n := public._pm_count('f6ff0ce0-1101-4a00-8000-000000000001',
           format(e.tmpl, 'f6ff0ce0-2101-4a00-8000-000000000001'));
    insert into public._pm_results (entity, actor, expectation, observed, passed)
    values (e.entity, 'A1 reading own', '> 0', n, n > 0);

    -- same-tenant sibling: must be invisible
    n := public._pm_count('f6ff0ce0-1101-4a00-8000-000000000001',
           format(e.tmpl, 'f6ff0ce0-2102-4a00-8000-000000000002'));
    insert into public._pm_results (entity, actor, expectation, observed, passed)
    values (e.entity, 'A1 reading sibling A2 (same tenant)', '= 0', n, n = 0);

    -- other tenant: must be invisible
    n := public._pm_count('f6ff0ce0-1101-4a00-8000-000000000001',
           format(e.tmpl, 'f6ff0ce0-2103-4a00-8000-000000000003'));
    insert into public._pm_results (entity, actor, expectation, observed, passed)
    values (e.entity, 'A1 reading tenant B customer', '= 0', n, n = 0);

    -- a deactivated customer retains no reach, not even to its own records
    n := public._pm_count('f6ff0ce0-1104-4a00-8000-000000000004',
           format(e.tmpl, 'f6ff0ce0-2104-4a00-8000-000000000004'));
    insert into public._pm_results (entity, actor, expectation, observed, passed)
    values (e.entity, 'deactivated customer reading own', '= 0', n, n = 0);
  end loop;
end
$matrix$;

-- ===========================================================================
-- Write attempts, not just reads: a customer must not mutate another's
-- records, nor their own issued ones.
-- ===========================================================================
do $writes$
declare
  s text;
  function_result bigint;
begin
  -- A1 tries to retitle A2's job.
  s := case when public._pm_count('f6ff0ce0-1101-4a00-8000-000000000001', $q$
         with upd as (
           update public.jobs set title = 'hijacked'
           where customer_id = 'f6ff0ce0-2102-4a00-8000-000000000002' returning 1)
         select count(*) from upd$q$) = 0 then 'refused' else 'MUTATED' end;
  insert into public._pm_results (entity, actor, expectation, observed, passed)
  values ('jobs', 'A1 updating sibling job', 'refused', null, s = 'refused');

  -- A1 tries to delete A2's complaint.
  s := case when public._pm_count('f6ff0ce0-1101-4a00-8000-000000000001', $q$
         with del as (
           delete from public.complaints
           where customer_id = 'f6ff0ce0-2102-4a00-8000-000000000002' returning 1)
         select count(*) from del$q$) = 0 then 'refused' else 'DELETED' end;
  insert into public._pm_results (entity, actor, expectation, observed, passed)
  values ('complaints', 'A1 deleting sibling complaint', 'refused', null, s = 'refused');

  -- A1 tries to rewrite their OWN invoice total -- financial self-service.
  s := case when public._pm_count('f6ff0ce0-1101-4a00-8000-000000000001', $q$
         with upd as (
           update public.invoices set total = 0
           where customer_id = 'f6ff0ce0-2101-4a00-8000-000000000001' returning 1)
         select count(*) from upd$q$) = 0 then 'refused' else 'MUTATED' end;
  insert into public._pm_results (entity, actor, expectation, observed, passed)
  values ('invoices', 'A1 zeroing own invoice total', 'refused', null, s = 'refused');

  -- A1 tries to record a payment against their own invoice.
  s := case when public._pm_count('f6ff0ce0-1101-4a00-8000-000000000001', $q$
         with ins as (
           insert into public.invoice_payments (business_id, invoice_id, method, amount)
           select i.business_id, i.id, 'cash', 1 from public.invoices i
           where i.customer_id = 'f6ff0ce0-2101-4a00-8000-000000000001' returning 1)
         select count(*) from ins$q$) = 0 then 'refused' else 'INSERTED' end;
  insert into public._pm_results (entity, actor, expectation, observed, passed)
  values ('invoice_payments', 'A1 self-recording a payment', 'refused', null, s = 'refused');
end
$writes$;

-- The draft rule, asserted deliberately rather than left as a surprise: a
-- customer must NOT see the lines of an invoice that has not been issued.
do $draft$
declare
  v_inv uuid;
  n bigint;
begin
  insert into public.invoices (business_id, customer_id, status)
  values ('f6ff0ce0-0001-4a00-8000-000000000001',
          'f6ff0ce0-2101-4a00-8000-000000000001', 'draft')
  returning id into v_inv;

  insert into public.invoice_items
    (business_id, invoice_id, kind, name, quantity, unit_price, tax_rate, discount_amount)
  values ('f6ff0ce0-0001-4a00-8000-000000000001', v_inv, 'part', 'draft line', 1, 50, 0, 0);

  n := public._pm_count('f6ff0ce0-1101-4a00-8000-000000000001',
    format('select count(*) from public.invoice_items where invoice_id = %L', v_inv));
  insert into public._pm_results (entity, actor, expectation, observed, passed)
  values ('invoice_items', 'A1 reading own DRAFT invoice lines', '= 0', n, n = 0);

  -- ...and must see them once it is issued, or the portal shows an empty bill.
  update public.invoices set status = 'issued', issued_at = now(),
         invoice_number = 'INV-DRAFTCHK' where id = v_inv;
  n := public._pm_count('f6ff0ce0-1101-4a00-8000-000000000001',
    format('select count(*) from public.invoice_items where invoice_id = %L', v_inv));
  insert into public._pm_results (entity, actor, expectation, observed, passed)
  values ('invoice_items', 'A1 reading own ISSUED invoice lines', '> 0', n, n > 0);
end
$draft$;

-- Staff of tenant B must not reach tenant A's portal data either.
do $staff$
declare n bigint;
begin
  n := public._pm_count('f6ff0ce0-1002-4a00-8000-000000000002',
    'select count(*) from public.invoices where business_id = ''f6ff0ce0-0001-4a00-8000-000000000001''');
  insert into public._pm_results (entity, actor, expectation, observed, passed)
  values ('invoices', 'tenant B staff reading tenant A', '= 0', n, n = 0);

  n := public._pm_count('f6ff0ce0-1001-4a00-8000-000000000001',
    'select count(*) from public.invoices where business_id = ''f6ff0ce0-0001-4a00-8000-000000000001''');
  insert into public._pm_results (entity, actor, expectation, observed, passed)
  values ('invoices', 'tenant A staff reading tenant A', '> 0', n, n > 0);
end
$staff$;

-- ---------- report ----------
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

select format('CASE %s / %s = %s (expect %s, observed %s)',
              entity, actor, case when passed then 'PASS' else 'FAIL' end,
              expectation, coalesce(observed::text, 'n/a'))
from public._pm_results where not passed order by seq;

select format('cases=%s passed=%s failed=%s entities=%s',
              count(*), count(*) filter (where passed),
              count(*) filter (where not passed), count(distinct entity))
from public._pm_results;

select case when count(*) filter (where not passed) = 0
            then 'PORTAL_MATRIX_OK' else 'PORTAL_MATRIX_FAILED' end
from public._pm_results;
