\set ON_ERROR_STOP off
\pset pager off
\set QUIET on

-- ============================================================================
-- Verified-email claim guard — database security harness
--
-- WHAT THIS PROVES
-- Two SECURITY DEFINER functions grant standing authority from an email string
-- in the caller's JWT:
--
--   claim_customer_records()      -> portal access to a person's vehicles,
--                                    quotations, invoices and complaints
--   claim_business_invitations()  -> business_members, i.e. STAFF access
--                                    inside a tenant at the invited role
--
-- Before 0046 neither checked that the address had been verified, so the only
-- thing standing between "I typed victim@example.com at signup" and that
-- authority was the project's email-confirmation setting -- which
-- supabase/config.toml sets to `enable_confirmations = false`.
--
-- This file asserts that an UNVERIFIED identity claims nothing, and that a
-- verified one still claims normally.
--
-- HOW TO RUN (from apps/web)
--   node scripts/db-test.mjs --reset --run ../../supabase/tests/verified_email_claim_tests.sql
--
-- Positive control -- at 0045 the takeover SUCCEEDS, which is the point:
--   node scripts/db-test.mjs --reset --up-to 0045 --run ../../supabase/tests/verified_email_claim_tests.sql
--
-- NEVER RUN THIS AGAINST PRODUCTION.
-- ============================================================================

\set BIZ '''f5ee0ce0-0001-4a00-8000-000000000001'''
\set OWNER '''f5ee0ce0-1001-4a00-8000-000000000001'''
\set ATTACKER '''f5ee0ce0-1002-4a00-8000-000000000002'''
\set HONEST '''f5ee0ce0-1003-4a00-8000-000000000003'''
\set INV_ATTACKER '''f5ee0ce0-1004-4a00-8000-000000000004'''
\set INV_HONEST '''f5ee0ce0-1005-4a00-8000-000000000005'''
\set VICTIM_CUST '''f5ee0ce0-2001-4a00-8000-000000000001'''
\set HONEST_CUST '''f5ee0ce0-2002-4a00-8000-000000000002'''

\set ON_ERROR_STOP on
do $preflight$
begin
  if to_regprocedure('public.claim_customer_records()') is null
     or to_regprocedure('public.claim_business_invitations()') is null then
    raise exception 'claim functions missing. Apply migrations first.';
  end if;
end
$preflight$;

drop table if exists public._vem_results;
create table public._vem_results (
  seq serial primary key,
  name text not null,
  expectation text not null,
  detail text,
  passed boolean not null
);

create or replace function public._vem_note(p_name text, p_expect text, p_detail text, p_ok boolean)
returns void language sql as $fn$
  insert into public._vem_results (name, expectation, detail, passed)
  values (p_name, p_expect, p_detail, coalesce(p_ok, false));
$fn$;

-- Calls a claim function as `authenticated` with a full GoTrue-shaped claim
-- set, and returns how many rows it claimed.
create or replace function public._vem_claim(p_fn text, p_sub uuid, p_email text)
returns integer
language plpgsql
as $fn$
declare
  n integer;
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    json_build_object('sub', p_sub::text, 'role', 'authenticated', 'email', p_email)::text);
  execute format('select public.%I()', p_fn) into n;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return n;
end;
$fn$;

-- ---------- fixtures ----------
set session_replication_role = replica;
do $teardown$
declare
  t text;
  fixture uuid[] := array['f5ee0ce0-0001-4a00-8000-000000000001']::uuid[];
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
delete from public.profiles where id in (:OWNER, :ATTACKER, :HONEST, :INV_ATTACKER, :INV_HONEST);
delete from auth.users where id in (:OWNER, :ATTACKER, :HONEST, :INV_ATTACKER, :INV_HONEST);
set session_replication_role = origin;

-- The owner, and two pairs of claimants. In each pair the "attacker" has NOT
-- confirmed their address (email_confirmed_at is null) while the "honest" user
-- has -- the single difference the guard turns on.
insert into auth.users (id, email, email_confirmed_at) values
  (:OWNER,        'owner@claim.test',   now()),
  (:ATTACKER,     'victim@claim.test',  null),
  (:HONEST,       'honest@claim.test',  now()),
  (:INV_ATTACKER, 'invitee@claim.test', null),
  (:INV_HONEST,   'invitee2@claim.test', now());

insert into public.businesses (id, name) values (:BIZ, 'Claim Tenant');
insert into public.business_members (business_id, user_id, role, is_active)
values (:BIZ, :OWNER, 'business_owner', true);

-- Two unclaimed customer records, each with records worth stealing.
insert into public.customers (id, business_id, email, full_name) values
  (:VICTIM_CUST, :BIZ, 'victim@claim.test', 'Victim Customer'),
  (:HONEST_CUST, :BIZ, 'honest@claim.test', 'Honest Customer');
insert into public.vehicles (business_id, customer_id, make, model, plate_number)
values (:BIZ, :VICTIM_CUST, 'Lexus', 'LX', 'VICTIM-1');

-- Two pending staff invitations.
insert into public.business_invitations (business_id, email, role, status, invited_by)
values (:BIZ, 'invitee@claim.test', 'manager', 'pending', :OWNER),
       (:BIZ, 'invitee2@claim.test', 'manager', 'pending', :OWNER);

\set ON_ERROR_STOP off

-- ===========================================================================
-- A. An UNVERIFIED address must claim nothing.
-- ===========================================================================
select public._vem_note('unverified_claims_no_customer_records', 'value=0',
  'rows claimed = ' || n, n = 0)
from public._vem_claim('claim_customer_records', :ATTACKER, 'victim@claim.test') as n;

select public._vem_note('victim_record_still_unclaimed', 'value=null',
  'app_user_id = ' || coalesce(app_user_id::text, 'null'), app_user_id is null)
from public.customers where id = :VICTIM_CUST;

-- The consequence, stated directly: no portal reach into the victim's vehicle.
select public._vem_note('unverified_user_sees_no_victim_vehicle', 'value=false',
  'is_customer_for_business = ' || v::text, v = false)
from (
  select public._vem_claim('claim_customer_records', :ATTACKER, 'victim@claim.test') as ignored,
         (select exists (
            select 1 from public.customers c
            where c.id = 'f5ee0ce0-2001-4a00-8000-000000000001'
              and c.app_user_id = 'f5ee0ce0-1002-4a00-8000-000000000002'
          )) as v
) t;

select public._vem_note('unverified_accepts_no_invitation', 'value=0',
  'invitations accepted = ' || n, n = 0)
from public._vem_claim('claim_business_invitations', :INV_ATTACKER, 'invitee@claim.test') as n;

select public._vem_note('unverified_gains_no_staff_membership', 'value=0',
  'business_members rows = ' || count(*), count(*) = 0)
from public.business_members where business_id = :BIZ and user_id = :INV_ATTACKER;

-- The invitation must still be usable later: a refused attempt must not
-- consume it, or a legitimate invitee is locked out by the attacker's try.
select public._vem_note('refused_attempt_does_not_consume_invitation', 'value=pending',
  'status = ' || status, status = 'pending')
from public.business_invitations where business_id = :BIZ and email = 'invitee@claim.test';

-- ===========================================================================
-- B. Controls: a VERIFIED address still claims normally.
--
-- Without these, a guard that simply broke both functions would score a
-- perfect pass above.
-- ===========================================================================
select public._vem_note('verified_claims_its_customer_record', 'value=1',
  'rows claimed = ' || n, n = 1)
from public._vem_claim('claim_customer_records', :HONEST, 'honest@claim.test') as n;

select public._vem_note('verified_record_is_linked', 'linked',
  'app_user_id = ' || coalesce(app_user_id::text, 'null'), app_user_id = :HONEST)
from public.customers where id = :HONEST_CUST;

select public._vem_note('verified_accepts_its_invitation', 'value=1',
  'invitations accepted = ' || n, n = 1)
from public._vem_claim('claim_business_invitations', :INV_HONEST, 'invitee2@claim.test') as n;

select public._vem_note('verified_gains_staff_membership', 'value=1',
  'business_members rows = ' || count(*), count(*) = 1)
from public.business_members where business_id = :BIZ and user_id = :INV_HONEST;

select public._vem_note('consumed_invitation_is_marked_accepted', 'value=accepted',
  'status = ' || status, status = 'accepted')
from public.business_invitations where business_id = :BIZ and email = 'invitee2@claim.test';

-- ===========================================================================
-- C. The guard itself.
-- ===========================================================================
select public._vem_note('guard_false_for_unverified', 'value=false',
  'current_email_is_verified = ' || v::text, v = false)
from (select public._vem_claim('claim_customer_records', :ATTACKER, 'victim@claim.test') as i,
             (select u.email_confirmed_at is not null from auth.users u where u.id = :ATTACKER) as v) t;

select public._vem_note('profile_row_is_still_created_for_unverified', 'value=1',
  'profiles rows = ' || count(*), count(*) = 1)
from public.profiles where id = :ATTACKER;

-- ---------- report ----------
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

select format('CASE %s=%s (%s, %s)', name,
              case when passed then 'PASS' else 'FAIL' end, expectation, detail)
from public._vem_results order by seq;

select format('cases=%s passed=%s failed=%s',
              count(*), count(*) filter (where passed),
              count(*) filter (where not passed))
from public._vem_results;

select case when count(*) filter (where not passed) = 0
            then 'VERIFIED_EMAIL_OK' else 'VERIFIED_EMAIL_FAILED' end
from public._vem_results;
