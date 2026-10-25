\set ON_ERROR_STOP off
\pset pager off
\set QUIET on

-- ============================================================================
-- Stage 0 inbound capture — database security harness (migration 0048)
--
-- WHAT THIS PROVES
-- Stage 0 introduces the app's first unauthenticated inbound path. Three
-- properties have to hold, and none of them can be demonstrated by the offline
-- suite, which asserts source text rather than policy behaviour:
--
--   1. TENANT RESOLUTION IS STRUCTURAL. Two tenants cannot both claim the same
--      external channel account, and a tenant cannot create a route at all.
--      Without this, inserting a route for someone else's Instagram page id
--      diverts their inbound leads into your tenant.
--   2. CROSS-TENANT ATTACHMENT IS IMPOSSIBLE. A lead, an identity or a message
--      labelled business_id = A cannot hang off tenant B's rows. Composite
--      foreign keys enforce this on EVERY write path, RLS included or bypassed.
--   3. THE PRE-TENANT TABLE IS UNREACHABLE. inbound_webhook_events is written
--      before a tenant is known, so it carries no tenant predicate; anon and
--      authenticated must be denied outright.
--
-- Plus: a lead is business-internal. No portal user may read one.
--
-- HOW TO RUN (from apps/web)
--   node scripts/db-test.mjs --reset --run ../../supabase/tests/inbound_capture_tests.sql
--
-- POSITIVE CONTROL. Build the schema one migration earlier and run the same
-- file; the preflight must refuse because the Stage 0 tables do not exist:
--   node scripts/db-test.mjs --reset --up-to 0047 --run ../../supabase/tests/inbound_capture_tests.sql
--
-- READING THE OUTPUT
-- Each case prints `CASE <name>=PASS|FAIL`. A case PASSES when a cross-tenant
-- or unprivileged write is REFUSED and a legitimate same-tenant write is
-- ACCEPTED. The final line is INBOUND_CAPTURE_OK only when every case passed.
--
-- NEVER RUN THIS AGAINST PRODUCTION. It runs as `postgres` and writes fixture
-- rows under the two tenants below, which this file creates and owns (prefix
-- `facade01`).
-- ============================================================================

\set BIZ_A '''facade01-0001-4a00-8000-000000000001'''
\set BIZ_B '''facade01-0002-4a00-8000-000000000002'''

\set MGR_A '''facade01-1001-4a00-8000-000000000001'''
\set CUS_A_USER '''facade01-1002-4a00-8000-000000000002'''
\set MGR_B '''facade01-1003-4a00-8000-000000000003'''

\set CUST_A '''facade01-2001-4a00-8000-000000000001'''
\set CUST_B '''facade01-2002-4a00-8000-000000000002'''

\set IDENT_A '''facade01-3001-4a00-8000-000000000001'''
\set IDENT_B '''facade01-3002-4a00-8000-000000000002'''

\set LEAD_A '''facade01-4001-4a00-8000-000000000001'''
\set LEAD_B '''facade01-4002-4a00-8000-000000000002'''

-- ---------- preflight ----------
-- Doubles as the positive control: at schema 0047 these tables do not exist
-- and this raises, so a green run cannot be mistaken for a vacuous one.
\set ON_ERROR_STOP on
do $preflight$
declare
  missing text;
begin
  select string_agg(t, ', ') into missing
  from unnest(array[
    'businesses','business_members','customers',
    'inbound_channel_routes','inbound_webhook_events',
    'channel_identities','leads','lead_messages'
  ]) as t
  where to_regclass('public.' || t) is null;

  if missing is not null then
    raise exception 'Stage 0 schema missing (%). Apply migration 0048 first.', missing;
  end if;

  if to_regprocedure('public.consume_rate_limit(text, text)') is null then
    raise exception 'consume_rate_limit missing. Apply migrations 0044 and 0049 first.';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Result ledger and drivers.
--
-- _inb_try takes the ROLE as well as the subject, because one of the
-- properties under test concerns `anon`, not `authenticated`. Dropping
-- privilege is what makes the policies run at all: `postgres` owns these
-- tables and RLS does not apply to a table owner, so a test that forgot to
-- switch role would pass vacuously.
-- ---------------------------------------------------------------------------
drop table if exists public._inb_results;
create table public._inb_results (
  seq serial primary key,
  name text not null,
  expectation text not null,
  sqlstate text not null,
  passed boolean not null,
  detail text
);

create or replace function public._inb_try(p_sql text, p_sub uuid, p_role text default 'authenticated')
returns text
language plpgsql
as $$
declare
  state text := '00000';
begin
  execute format('set local role %I', p_role);
  if p_sub is not null then
    execute format(
      'set local request.jwt.claims = %L',
      json_build_object('sub', p_sub::text, 'role', p_role)::text
    );
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

create or replace function public._inb_case(
  p_name text, p_expect text, p_sql text, p_sub uuid, p_role text default 'authenticated'
) returns void
language plpgsql
as $$
declare
  state text;
  ok boolean;
begin
  state := public._inb_try(p_sql, p_sub, p_role);
  ok := case when p_expect = 'reject' then state <> '00000' else state = '00000' end;
  insert into public._inb_results (name, expectation, sqlstate, passed, detail)
  values (p_name, p_expect, state, ok,
          case when state = '00000' then 'accepted' else 'refused ' || state end);
end;
$$;

-- Counts rows visible to a given principal, under that principal's RLS.
create or replace function public._inb_visible(p_sql text, p_sub uuid, p_role text default 'authenticated')
returns integer
language plpgsql
as $$
declare
  n integer := -1;
begin
  execute format('set local role %I', p_role);
  execute format(
    'set local request.jwt.claims = %L',
    json_build_object('sub', p_sub::text, 'role', p_role)::text
  );
  begin
    execute p_sql into n;
  exception when others then
    n := -1;
  end;
  execute 'reset role';
  execute 'select set_config(''request.jwt.claims'', '''', true)';
  return n;
end;
$$;

-- ---------- fixtures ----------
-- Teardown first, with triggers suppressed. Replica mode also disables FK
-- cascades, so every fixture row is removed explicitly rather than relied on
-- to cascade; without it the audit_row_change() trigger inserts an
-- audit_events row referencing the business being deleted, and audit_events is
-- the only NO ACTION reference to businesses.
set session_replication_role = replica;
do $teardown$
declare
  t text;
  fixture uuid[] := array[
    'facade01-0001-4a00-8000-000000000001',
    'facade01-0002-4a00-8000-000000000002'
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
delete from auth.users where id in (:MGR_A, :CUS_A_USER, :MGR_B);
set session_replication_role = origin;

insert into auth.users (id, email, email_confirmed_at)
values (:MGR_A, 'mgr-a@inbound.test', now()),
       (:CUS_A_USER, 'cus-a@inbound.test', now()),
       (:MGR_B, 'mgr-b@inbound.test', now());

insert into public.businesses (id, name) values (:BIZ_A, 'Inbound A'), (:BIZ_B, 'Inbound B');

insert into public.business_members (business_id, user_id, role, is_active)
values (:BIZ_A, :MGR_A, 'manager', true),
       (:BIZ_B, :MGR_B, 'manager', true);

insert into public.customers (id, business_id, app_user_id, full_name)
values (:CUST_A, :BIZ_A, :CUS_A_USER, 'Customer A'),
       (:CUST_B, :BIZ_B, null, 'Customer B');

-- A channel identity and a lead in each tenant, inserted as owner (postgres)
-- so the fixtures exist regardless of policy.
insert into public.channel_identities (id, business_id, channel, external_id, display_name)
values (:IDENT_A, :BIZ_A, 'instagram', 'ig-psid-aaa', 'Stranger A'),
       (:IDENT_B, :BIZ_B, 'instagram', 'ig-psid-bbb', 'Stranger B');

insert into public.leads (id, business_id, channel, channel_identity_id, subject)
values (:LEAD_A, :BIZ_A, 'instagram', :IDENT_A, 'Noise from front wheel'),
       (:LEAD_B, :BIZ_B, 'instagram', :IDENT_B, 'Service quote please');

-- Tenant B owns an Instagram route. Tenant A will try to claim the same one.
insert into public.inbound_channel_routes
  (business_id, channel, external_account_id, display_label)
values (:BIZ_B, 'instagram', 'ig-account-shared-0001', 'B official IG');

\set ON_ERROR_STOP off

-- ===========================================================================
-- 1. TENANT RESOLUTION
-- ===========================================================================

-- A manager of A claims B's Instagram account. Must be refused: the global
-- unique is the resolution guarantee, and route writes are admin-only anyway.
select public._inb_case(
  'route_claim_other_tenants_account', 'reject',
  format($q$insert into public.inbound_channel_routes
      (business_id, channel, external_account_id)
    values (%L, 'instagram', 'ig-account-shared-0001')$q$, :BIZ_A),
  :MGR_A);

-- A manager of A creates a route for its OWN business. Still refused: route
-- creation is platform-admin only, because the account id is unverifiable
-- from inside the tenant.
select public._inb_case(
  'route_self_service_creation_blocked', 'reject',
  format($q$insert into public.inbound_channel_routes
      (business_id, channel, external_account_id)
    values (%L, 'whatsapp', '971500000001')$q$, :BIZ_A),
  :MGR_A);

-- Even with RLS out of the picture, the global unique must still refuse a
-- second tenant claiming the same account (expected 23505). Without this the
-- policy masks the structural layer and the uniqueness is never tested.
do $structural_route$
declare
  state text := '00000';
begin
  begin
    insert into public.inbound_channel_routes
      (business_id, channel, external_account_id)
    values ('facade01-0001-4a00-8000-000000000001', 'instagram',
            'ig-account-shared-0001');
  exception when others then
    state := sqlstate;
  end;
  insert into public._inb_results (name, expectation, sqlstate, passed, detail)
  values ('route_account_unique_with_rls_bypassed', 'reject', state,
          state = '23505',
          case when state = '00000' then 'ACCEPTED: two tenants own one account'
               else 'refused ' || state end);
end
$structural_route$;

-- A manager of A may READ its own routes (control: the read policy works).
insert into public._inb_results (name, expectation, sqlstate, passed, detail)
select 'route_owner_can_read_own', 'accept', '-',
       public._inb_visible(
         format('select count(*) from public.inbound_channel_routes where business_id = %L', :BIZ_B),
         :MGR_B) = 1,
       'routes visible to B manager=' ||
       public._inb_visible(
         format('select count(*) from public.inbound_channel_routes where business_id = %L', :BIZ_B),
         :MGR_B);

-- ===========================================================================
-- 2. CROSS-TENANT ATTACHMENT
-- ===========================================================================

-- A lead labelled A pointing at tenant B's customer.
select public._inb_case(
  'lead_attached_to_other_tenants_customer', 'reject',
  format($q$insert into public.leads (business_id, channel, customer_id, subject)
    values (%L, 'whatsapp', %L, 'forged')$q$, :BIZ_A, :CUST_B),
  :MGR_A);

-- A lead labelled A pointing at tenant B's channel identity.
select public._inb_case(
  'lead_attached_to_other_tenants_identity', 'reject',
  format($q$insert into public.leads
      (business_id, channel, channel_identity_id, subject)
    values (%L, 'instagram', %L, 'forged')$q$, :BIZ_A, :IDENT_B),
  :MGR_A);

-- A message labelled A hung off tenant B's lead.
select public._inb_case(
  'message_attached_to_other_tenants_lead', 'reject',
  format($q$insert into public.lead_messages
      (business_id, lead_id, direction, author_type, body)
    values (%L, %L, 'outbound', 'staff', 'forged reply')$q$, :BIZ_A, :LEAD_B),
  :MGR_A);

-- An identity labelled A claiming tenant B's customer.
select public._inb_case(
  'identity_claims_other_tenants_customer', 'reject',
  format($q$insert into public.channel_identities
      (business_id, channel, external_id, customer_id)
    values (%L, 'sms', '971500000099', %L)$q$, :BIZ_A, :CUST_B),
  :MGR_A);

-- CONTROLS: the same writes within one tenant must be ACCEPTED, or every
-- rejection above could simply mean "nothing can be written at all".
select public._inb_case(
  'control_lead_own_tenant_customer_accepted', 'accept',
  format($q$insert into public.leads (business_id, channel, customer_id, subject)
    values (%L, 'whatsapp', %L, 'legitimate')$q$, :BIZ_A, :CUST_A),
  :MGR_A);

select public._inb_case(
  'control_message_own_tenant_lead_accepted', 'accept',
  format($q$insert into public.lead_messages
      (business_id, lead_id, direction, author_type, body)
    values (%L, %L, 'outbound', 'staff', 'legitimate reply')$q$, :BIZ_A, :LEAD_A),
  :MGR_A);

-- Structural layer, RLS bypassed: the composite FK must refuse with 23503.
-- Run as the table owner, so no policy is consulted.
do $structural_lead$
declare
  state text := '00000';
begin
  begin
    insert into public.leads (business_id, channel, customer_id, subject)
    values ('facade01-0001-4a00-8000-000000000001', 'whatsapp',
            'facade01-2002-4a00-8000-000000000002', 'forged with rls bypassed');
  exception when others then
    state := sqlstate;
  end;
  insert into public._inb_results (name, expectation, sqlstate, passed, detail)
  values ('lead_cross_tenant_refused_with_rls_bypassed', 'reject', state,
          state = '23503',
          case when state = '00000'
               then 'ACCEPTED: composite FK missing, policies were the only layer'
               else 'refused ' || state end);
end
$structural_lead$;

-- Same for lead_messages. Above it was refused with 42501 -- the POLICY -- which
-- tells us nothing about whether the composite FK exists. With RLS bypassed the
-- structural layer must refuse it with 23503 on its own.
do $structural_message$
declare
  state text := '00000';
begin
  begin
    insert into public.lead_messages
      (business_id, lead_id, direction, author_type, body)
    values ('facade01-0001-4a00-8000-000000000001',
            'facade01-4002-4a00-8000-000000000002',
            'outbound', 'staff', 'forged with rls bypassed');
  exception when others then
    state := sqlstate;
  end;
  insert into public._inb_results (name, expectation, sqlstate, passed, detail)
  values ('message_cross_tenant_refused_with_rls_bypassed', 'reject', state,
          state = '23503',
          case when state = '00000'
               then 'ACCEPTED: composite FK missing on lead_messages'
               else 'refused ' || state end);
end
$structural_message$;

-- ===========================================================================
-- 3. THE PRE-TENANT TABLE
-- ===========================================================================

select public._inb_case(
  'webhook_events_insert_blocked_for_authenticated', 'reject',
  $q$insert into public.inbound_webhook_events
      (channel, signature_verified, payload)
    values ('instagram', true, '{}'::jsonb)$q$,
  :MGR_A);

select public._inb_case(
  'webhook_events_select_blocked_for_authenticated', 'reject',
  'select 1 from public.inbound_webhook_events limit 1',
  :MGR_A);

select public._inb_case(
  'webhook_events_insert_blocked_for_anon', 'reject',
  $q$insert into public.inbound_webhook_events
      (channel, signature_verified, payload)
    values ('instagram', false, '{}'::jsonb)$q$,
  null, 'anon');

-- ===========================================================================
-- 4. READ ISOLATION, and the deliberate absence of portal access
-- ===========================================================================

-- Counted as "rows belonging to B that A can see", not "total rows A can
-- see": the accepted control above legitimately adds a second lead to tenant
-- A, and an assertion on the total would fail for the wrong reason. The
-- property under test is that NONE of B's rows are visible.
insert into public._inb_results (name, expectation, sqlstate, passed, detail)
select 'manager_a_cannot_see_tenant_b_leads', 'reject', '-',
       public._inb_visible(
         format('select count(*) from public.leads where business_id = %L', :BIZ_B),
         :MGR_A) = 0,
       'B leads visible to A manager=' ||
       public._inb_visible(
         format('select count(*) from public.leads where business_id = %L', :BIZ_B),
         :MGR_A);

-- Control for the case above: A must see its own leads, or "sees none of B's"
-- would be satisfied by a policy that hides everything from everyone.
insert into public._inb_results (name, expectation, sqlstate, passed, detail)
select 'control_manager_a_sees_own_leads', 'accept', '-',
       public._inb_visible(
         format('select count(*) from public.leads where business_id = %L', :BIZ_A),
         :MGR_A) >= 1,
       'own leads visible to A manager=' ||
       public._inb_visible(
         format('select count(*) from public.leads where business_id = %L', :BIZ_A),
         :MGR_A);

insert into public._inb_results (name, expectation, sqlstate, passed, detail)
select 'manager_a_cannot_see_tenant_b_messages', 'reject', '-',
       public._inb_visible(
         format('select count(*) from public.lead_messages where business_id = %L', :BIZ_B),
         :MGR_A) = 0,
       'B messages visible to A manager=' ||
       public._inb_visible(
         format('select count(*) from public.lead_messages where business_id = %L', :BIZ_B),
         :MGR_A);

insert into public._inb_results (name, expectation, sqlstate, passed, detail)
select 'portal_customer_sees_no_leads', 'reject', '-',
       public._inb_visible('select count(*) from public.leads', :CUS_A_USER) = 0,
       'leads visible to portal customer=' ||
       public._inb_visible('select count(*) from public.leads', :CUS_A_USER);

insert into public._inb_results (name, expectation, sqlstate, passed, detail)
select 'portal_customer_sees_no_lead_messages', 'reject', '-',
       public._inb_visible('select count(*) from public.lead_messages', :CUS_A_USER) = 0,
       'messages visible to portal customer=' ||
       public._inb_visible('select count(*) from public.lead_messages', :CUS_A_USER);

-- ===========================================================================
-- 5. AI ATTRIBUTION
-- An ai_agent turn with no ai_tool_calls row must be refused, so no generated
-- message is ever unattributable.
-- ===========================================================================

select public._inb_case(
  'ai_message_without_tool_call_refused', 'reject',
  format($q$insert into public.lead_messages
      (business_id, lead_id, direction, author_type, body, ai_tool_call_id)
    values (%L, %L, 'outbound', 'ai_agent', 'generated', null)$q$,
    :BIZ_A, :LEAD_A),
  :MGR_A);

-- ===========================================================================
-- 6. THE RATE LIMITER (migration 0049)
-- The inbound routes are public, so the unverified path is limited through the
-- SECURITY DEFINER limiter from 0044. Three properties: the new scope is
-- allowlisted, an unknown scope still fails closed, and anon cannot call the
-- function directly to burn someone else's bucket.
-- ===========================================================================

do $limiter$
declare
  state text := '00000';
  allowed boolean;
begin
  begin
    select public.consume_rate_limit('inbound_ip', '203.0.113.7') into allowed;
  exception when others then
    state := sqlstate;
  end;
  insert into public._inb_results (name, expectation, sqlstate, passed, detail)
  values ('limiter_inbound_ip_scope_allowlisted', 'accept', state,
          state = '00000' and allowed is true,
          case when state <> '00000' then 'raised ' || state
               else 'first call allowed=' || coalesce(allowed::text, 'null') end);
end
$limiter$;

-- Fail closed on an unknown scope: a typo must not become an unlimited bucket.
do $limiter_unknown$
declare
  state text := '00000';
begin
  begin
    perform public.consume_rate_limit('not_a_real_scope', 'x');
  exception when others then
    state := sqlstate;
  end;
  insert into public._inb_results (name, expectation, sqlstate, passed, detail)
  values ('limiter_unknown_scope_fails_closed', 'reject', state,
          state <> '00000',
          case when state = '00000' then 'ACCEPTED: unknown scope was allowed'
               else 'refused ' || state end);
end
$limiter_unknown$;

-- anon must not reach the limiter directly: knowing a victim's identifier
-- would otherwise be enough to exhaust their bucket with unauthenticated
-- calls. 0044 revokes from public, anon AND authenticated for this reason.
select public._inb_case(
  'limiter_not_callable_by_anon', 'reject',
  $q$select public.consume_rate_limit('inbound_ip', '203.0.113.7')$q$,
  null, 'anon');

select public._inb_case(
  'limiter_not_callable_by_authenticated', 'reject',
  $q$select public.consume_rate_limit('inbound_ip', '203.0.113.7')$q$,
  :MGR_A);

-- ---------- report ----------
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

select format('CASE %s=%s (%s, %s)', name,
              case when passed then 'PASS' else 'FAIL' end,
              expectation, detail)
from public._inb_results order by seq;

select format('cases=%s passed=%s failed=%s',
              count(*), count(*) filter (where passed),
              count(*) filter (where not passed))
from public._inb_results;

select case
  when count(*) filter (where not passed) = 0 then 'INBOUND_CAPTURE_OK'
  else 'INBOUND_CAPTURE_FAILED'
end
from public._inb_results;
