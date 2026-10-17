\set ON_ERROR_STOP off
\pset pager off
\set QUIET on

-- ============================================================================
-- Auth hardening — database security harness
--
-- Covers the work ported from security/appsec-10-auth-hardening:
--   0044  the Postgres-backed auth rate limiter
--   0045  the MFA assurance-level predicates
--
-- WHAT THIS PROVES
--   * The rate limiter is reachable ONLY through the SECURITY DEFINER RPC, by
--     service_role. If anon or authenticated could call it, an attacker who
--     knows a victim's email could burn their login bucket with a few
--     unauthenticated curl calls and lock them out without ever attempting a
--     login -- a denial-of-service handed over by the grant, not the logic.
--   * The limits actually bite, at the documented thresholds, and an unknown
--     scope fails closed rather than silently allowing.
--   * Identifiers are hashed, so raw emails and IPs never land in the table.
--   * The assurance predicates fail CLOSED: no JWT, no aal claim, or a
--     malformed one all resolve to not-aal2.
--
-- WHAT THIS DELIBERATELY DOES NOT PROVE
--   is_super_admin() is NOT yet tightened to require aal2, because production
--   has 2 platform admins and 0 verified factors and the switch would lock
--   both out. The residual is asserted as documented, not as fixed.
--
-- HOW TO RUN (from apps/web)
--   node scripts/db-test.mjs --reset --run ../../supabase/tests/auth_hardening_tests.sql
--
-- Positive control (before 0044/0045 the objects do not exist):
--   node scripts/db-test.mjs --reset --up-to 0043 --run ../../supabase/tests/auth_hardening_tests.sql
--
-- NEVER RUN THIS AGAINST PRODUCTION.
-- ============================================================================

\set ADMIN '''f4dd0ce0-1001-4a00-8000-000000000001'''
\set ADMIN2 '''f4dd0ce0-1002-4a00-8000-000000000002'''
\set PLAIN '''f4dd0ce0-1003-4a00-8000-000000000003'''

\set ON_ERROR_STOP on
do $preflight$
declare
  missing text;
begin
  select string_agg(f, ', ') into missing
  from unnest(array[
    'consume_rate_limit(text,text)',
    'current_assurance_level()',
    'has_admin_aal2()',
    'admin_aal2_readiness()'
  ]) as f
  where to_regprocedure('public.' || f) is null;
  if missing is not null then
    raise exception 'auth hardening objects missing (%). Apply migrations through 0045.', missing;
  end if;
  if to_regclass('public.auth_rate_limits') is null then
    raise exception 'auth_rate_limits missing. Apply migrations through 0045.';
  end if;
end
$preflight$;

drop table if exists public._auth_results;
create table public._auth_results (
  seq serial primary key,
  name text not null,
  expectation text not null,
  detail text,
  passed boolean not null
);

create or replace function public._auth_note(p_name text, p_expect text, p_detail text, p_ok boolean)
returns void language sql as $fn$
  insert into public._auth_results (name, expectation, detail, passed)
  values (p_name, p_expect, p_detail, coalesce(p_ok, false));
$fn$;

-- Runs a statement as a chosen role, optionally with JWT claims, and returns
-- the SQLSTATE. '00000' means it was accepted.
create or replace function public._auth_try(p_sql text, p_role text, p_claims jsonb default null)
returns text language plpgsql as $fn$
declare
  state text := '00000';
begin
  execute format('set local role %I', p_role);
  if p_claims is not null then
    execute format('set local request.jwt.claims = %L', p_claims::text);
  end if;
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

-- Evaluates a boolean expression under chosen claims, as `authenticated`.
create or replace function public._auth_eval(p_expr text, p_claims jsonb)
returns boolean language plpgsql as $fn$
declare
  v boolean;
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', p_claims::text);
  execute 'select ' || p_expr into v;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end;
$fn$;

-- ---------- fixtures ----------
set session_replication_role = replica;
delete from public.platform_admins where user_id in (:ADMIN, :ADMIN2, :PLAIN);
delete from auth.mfa_factors where user_id in (:ADMIN, :ADMIN2, :PLAIN);
delete from auth.users where id in (:ADMIN, :ADMIN2, :PLAIN);
set session_replication_role = origin;

insert into auth.users (id, email, email_confirmed_at) values
  (:ADMIN,  'admin-enrolled@auth.test', now()),
  (:ADMIN2, 'admin-unenrolled@auth.test', now()),
  (:PLAIN,  'plain@auth.test', now());

insert into public.platform_admins (user_id) values (:ADMIN), (:ADMIN2);

-- One admin has a verified TOTP factor; the other has none. That asymmetry is
-- what the readiness function exists to report.
insert into auth.mfa_factors (user_id, friendly_name, factor_type, status)
values (:ADMIN, 'authenticator', 'totp', 'verified');

truncate table public.auth_rate_limits;

\set ON_ERROR_STOP off

-- ===========================================================================
-- A. The limiter is reachable only by service_role.
-- ===========================================================================
select public._auth_note('anon_cannot_call_limiter', 'reject',
  'sqlstate ' || public._auth_try($q$select public.consume_rate_limit('login_ip','1.2.3.4')$q$, 'anon'),
  public._auth_try($q$select public.consume_rate_limit('login_ip','1.2.3.4')$q$, 'anon') <> '00000');

select public._auth_note('authenticated_cannot_call_limiter', 'reject',
  'sqlstate ' || public._auth_try($q$select public.consume_rate_limit('login_ip','1.2.3.4')$q$, 'authenticated'),
  public._auth_try($q$select public.consume_rate_limit('login_ip','1.2.3.4')$q$, 'authenticated') <> '00000');

select public._auth_note('anon_cannot_read_the_bucket_table', 'reject',
  'sqlstate ' || public._auth_try('select count(*) from public.auth_rate_limits', 'anon'),
  public._auth_try('select count(*) from public.auth_rate_limits', 'anon') <> '00000');

select public._auth_note('authenticated_cannot_read_the_bucket_table', 'reject',
  'sqlstate ' || public._auth_try('select count(*) from public.auth_rate_limits', 'authenticated'),
  public._auth_try('select count(*) from public.auth_rate_limits', 'authenticated') <> '00000');

-- ===========================================================================
-- B. The limits bite at the documented thresholds.
-- ===========================================================================
do $limits$
declare
  r record;
  allowed int;
  denied int;
  ok boolean;
begin
  for r in
    select * from (values
      ('login_ip', 20, '10.0.0.1'),
      ('login_email', 8, 'victim@example.com'),
      ('password_reset_email', 5, 'reset@example.com'),
      ('magic_link_email', 5, 'magic@example.com')
    ) as t(scope, limit_n, ident)
  loop
    allowed := 0; denied := 0;
    for i in 1..(r.limit_n + 3) loop
      select public.consume_rate_limit(r.scope, r.ident) into ok;
      if ok then allowed := allowed + 1; else denied := denied + 1; end if;
    end loop;
    perform public._auth_note(
      'limit_' || r.scope, 'allowed=' || r.limit_n,
      'allowed=' || allowed || ' denied=' || denied,
      allowed = r.limit_n and denied = 3);
  end loop;
end
$limits$;

select public._auth_note('unknown_scope_fails_closed', 'reject',
  'sqlstate ' || public._auth_try($q$select public.consume_rate_limit('not_a_scope','x')$q$, 'postgres'),
  public._auth_try($q$select public.consume_rate_limit('not_a_scope','x')$q$, 'postgres') <> '00000');

-- Separate identifiers must not share a bucket, or one user's attempts would
-- lock out another.
do $iso$
declare ok boolean;
begin
  perform public.consume_rate_limit('login_email', 'isolated-a@example.com');
  select public.consume_rate_limit('login_email', 'isolated-b@example.com') into ok;
  perform public._auth_note('buckets_are_per_identifier', 'allowed',
    'second identifier allowed=' || ok, ok);
end
$iso$;

-- ===========================================================================
-- C. Identifiers are hashed, never stored raw.
-- ===========================================================================
select public._auth_note('identifiers_hashed_not_stored_raw', 'value=0',
  'rows containing a raw identifier = ' || count(*), count(*) = 0)
from public.auth_rate_limits
where bucket_key like '%@example.com%' or bucket_key like '%10.0.0.1%';

select public._auth_note('bucket_key_is_scope_plus_sha256', 'matches',
  'sample = ' || coalesce((select bucket_key from public.auth_rate_limits
                            where bucket_key like 'login_email:%' limit 1), '(none)'),
  exists (select 1 from public.auth_rate_limits
          where bucket_key ~ '^login_email:[0-9a-f]{64}$'));

-- ===========================================================================
-- D. Assurance predicates fail closed.
-- ===========================================================================
-- A session with no `aal` claim must resolve to aal1, not to NULL and not to
-- something permissive. _auth_eval returns a boolean, so the predicate is
-- evaluated inside the session rather than compared outside it.
select public._auth_note('aal_defaults_to_aal1_without_claim', 'value=true',
  'current_assurance_level() = aal1 is ' || v::text, v = true)
from public._auth_eval($$public.current_assurance_level() = 'aal1'$$,
  jsonb_build_object('sub', :ADMIN, 'role', 'authenticated')) as v;

-- And an explicit aal2 claim must actually be read, or the predicate above
-- would pass simply by always returning aal1.
select public._auth_note('aal_reads_an_explicit_aal2_claim', 'value=true',
  'current_assurance_level() = aal2 is ' || v::text, v = true)
from public._auth_eval($$public.current_assurance_level() = 'aal2'$$,
  jsonb_build_object('sub', :ADMIN, 'role', 'authenticated', 'aal', 'aal2')) as v;

select public._auth_note('has_admin_aal2_false_at_aal1', 'value=false',
  'has_admin_aal2 = ' || v::text, v = false)
from public._auth_eval('public.has_admin_aal2()',
  jsonb_build_object('sub', :ADMIN, 'role', 'authenticated', 'aal', 'aal1')) as v;

select public._auth_note('has_admin_aal2_false_without_aal_claim', 'value=false',
  'has_admin_aal2 = ' || v::text, v = false)
from public._auth_eval('public.has_admin_aal2()',
  jsonb_build_object('sub', :ADMIN, 'role', 'authenticated')) as v;

select public._auth_note('has_admin_aal2_false_on_malformed_aal', 'value=false',
  'has_admin_aal2 = ' || v::text, v = false)
from public._auth_eval('public.has_admin_aal2()',
  jsonb_build_object('sub', :ADMIN, 'role', 'authenticated', 'aal', 'aal99')) as v;

select public._auth_note('has_admin_aal2_true_for_admin_at_aal2', 'value=true',
  'has_admin_aal2 = ' || v::text, v = true)
from public._auth_eval('public.has_admin_aal2()',
  jsonb_build_object('sub', :ADMIN, 'role', 'authenticated', 'aal', 'aal2')) as v;

-- aal2 alone is not authority: a non-admin at aal2 must still be refused.
select public._auth_note('has_admin_aal2_false_for_non_admin_at_aal2', 'value=false',
  'has_admin_aal2 = ' || v::text, v = false)
from public._auth_eval('public.has_admin_aal2()',
  jsonb_build_object('sub', :PLAIN, 'role', 'authenticated', 'aal', 'aal2')) as v;

-- The raising form must not reveal WHICH condition failed.
do $assert$
declare
  as_admin_aal1 text;
  as_plain_aal2 text;
begin
  as_admin_aal1 := public._auth_try('select public.assert_admin_aal2()', 'authenticated',
    jsonb_build_object('sub', 'f4dd0ce0-1001-4a00-8000-000000000001', 'role', 'authenticated', 'aal', 'aal1'));
  as_plain_aal2 := public._auth_try('select public.assert_admin_aal2()', 'authenticated',
    jsonb_build_object('sub', 'f4dd0ce0-1003-4a00-8000-000000000003', 'role', 'authenticated', 'aal', 'aal2'));
  perform public._auth_note('assert_is_non_enumerating', 'same sqlstate',
    'admin-at-aal1=' || as_admin_aal1 || ' non-admin-at-aal2=' || as_plain_aal2,
    as_admin_aal1 = as_plain_aal2 and as_admin_aal1 <> '00000');
end
$assert$;

-- ===========================================================================
-- E. Readiness reports enrolment truthfully.
-- ===========================================================================
select public._auth_note('readiness_lists_every_platform_admin', 'value=2',
  'rows = ' || count(*), count(*) = 2)
from public.admin_aal2_readiness();

select public._auth_note('readiness_flags_the_unenrolled_admin', 'value=1',
  'admins without a verified factor = ' || count(*), count(*) = 1)
from public.admin_aal2_readiness() where not has_verified_factor;

select public._auth_note('readiness_credits_the_enrolled_admin', 'value=1',
  'admins with a verified factor = ' || count(*), count(*) = 1)
from public.admin_aal2_readiness() where has_verified_factor;

-- An unverified factor must not count as enrolment.
insert into auth.mfa_factors (user_id, friendly_name, factor_type, status)
values (:ADMIN2, 'half-enrolled', 'totp', 'unverified');

select public._auth_note('unverified_factor_does_not_count', 'value=1',
  'still unenrolled = ' || count(*), count(*) = 1)
from public.admin_aal2_readiness() where not has_verified_factor;

select public._auth_note('readiness_not_callable_by_anon', 'reject',
  'sqlstate ' || public._auth_try('select * from public.admin_aal2_readiness()', 'anon'),
  public._auth_try('select * from public.admin_aal2_readiness()', 'anon') <> '00000');

-- ===========================================================================
-- F. The residual is documented, not silently forgotten.
--
-- is_super_admin() is intentionally still role-only. This asserts the comment
-- says so, so the gap cannot sit in the schema unexplained -- and if someone
-- tightens the function, this fails and makes them update the record.
-- ===========================================================================
select public._auth_note('is_super_admin_residual_is_documented', 'documented',
  case when d is null then '(no comment)' else left(d, 60) || '...' end,
  d is not null and d like '%Does NOT require aal2%')
from (select obj_description('public.is_super_admin()'::regprocedure, 'pg_proc') as d) t;

-- ---------- report ----------
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

select format('CASE %s=%s (%s, %s)', name,
              case when passed then 'PASS' else 'FAIL' end, expectation, detail)
from public._auth_results order by seq;

select format('cases=%s passed=%s failed=%s',
              count(*), count(*) filter (where passed),
              count(*) filter (where not passed))
from public._auth_results;

select case when count(*) filter (where not passed) = 0
            then 'AUTH_HARDENING_OK' else 'AUTH_HARDENING_FAILED' end
from public._auth_results;
