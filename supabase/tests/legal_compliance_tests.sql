-- Legal & Compliance Foundation V1 — RLS + privilege tests for migration 0038.
-- Run as postgres against a database that has 0001..0038 applied:
--   psql -U postgres -d <db> -f supabase/tests/legal_compliance_tests.sql
-- Every block prints PASS/FAIL; the script never leaves fixtures behind.
\set ON_ERROR_STOP off
\pset pager off
\set QUIET on

\set BIZ_A '''a902dbeb-ff3c-4278-a1a9-fe3b53af7af2'''
\set USER_A '''396f6f24-e118-4423-b41e-66a14fc2da90'''
\set USER_B '''0e4ac6a6-e404-4169-9ca7-51346ded6130'''

-- ---------- fixtures (as postgres, RLS bypassed) ----------
delete from public.notification_preferences where business_id = :BIZ_A;
delete from public.customers where business_id = :BIZ_A;
delete from public.businesses where id = :BIZ_A;
delete from auth.users where id in (:USER_A, :USER_B);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  (:USER_A, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'legal-a@example.test', 'x', now(), now(), now(), '{}', '{}'),
  (:USER_B, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'legal-b@example.test', 'x', now(), now(), now(), '{}', '{}');
insert into public.profiles (id, full_name) values (:USER_A, 'Cust A'), (:USER_B, 'Cust B') on conflict (id) do nothing;
insert into public.businesses (id, name) values (:BIZ_A, 'Legal Test Garage');
insert into public.customers (business_id, full_name, app_user_id) values (:BIZ_A, 'Cust A', :USER_A) returning id as cust_a \gset
insert into public.customers (business_id, full_name, app_user_id) values (:BIZ_A, 'Cust B', :USER_B) returning id as cust_b \gset

\set QUIET off
\echo ''
\echo '################ 0038 — anon privilege layer ################'
select case when count(*) = 0 then 'PASS' else 'FAIL' end as "anon cannot execute SECURITY DEFINER fns (except share resolvers)"
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and regexp_replace(p.oid::regprocedure::text, '^public\.', '') not in ('resolve_inspection_share(bytea)', 'resolve_inspection_share_items(bytea)')
  and has_function_privilege('anon', p.oid, 'EXECUTE');

select case when has_function_privilege('authenticated', 'public.is_customer_for_business(uuid,uuid)', 'EXECUTE') then 'PASS' else 'FAIL' end
  as "authenticated keeps EXECUTE on RLS helper";

select case when not has_function_privilege('authenticated', 'public.claim_queued_notification_events(integer,integer)', 'EXECUTE') then 'PASS' else 'FAIL' end
  as "service-role-only RPC was not widened to authenticated";

select case when proconfig @> array['search_path=""'] then 'PASS' else 'FAIL' end as "set_updated_at has empty search_path"
from pg_proc where proname = 'set_updated_at';

\echo ''
\echo '################ 0038 — portal preference policy ################'
set role authenticated;
set request.jwt.claim.sub = '396f6f24-e118-4423-b41e-66a14fc2da90';
set request.jwt.claims = '{"role":"authenticated","sub":"396f6f24-e118-4423-b41e-66a14fc2da90"}';

-- own account: insert allowed
insert into public.notification_preferences (business_id, customer_id, channel, enabled, opted_out_at)
values (:BIZ_A, :'cust_a', 'sms', false, now());
select case when count(*) = 1 then 'PASS' else 'FAIL' end as "customer can insert own template-wide preference"
from public.notification_preferences where customer_id = :'cust_a' and channel = 'sms';

-- own account: update allowed
update public.notification_preferences set enabled = true, opted_out_at = null
where customer_id = :'cust_a' and channel = 'sms';
select case when bool_and(enabled) then 'PASS' else 'FAIL' end as "customer can update own preference"
from public.notification_preferences where customer_id = :'cust_a' and channel = 'sms';

-- another customer's account: insert must be rejected by RLS
\echo '(expect: new row violates row-level security policy)'
insert into public.notification_preferences (business_id, customer_id, channel, enabled)
values (:BIZ_A, :'cust_b', 'email', false);
reset role;
select case when count(*) = 0 then 'PASS' else 'FAIL' end as "customer cannot write another customer's preference"
from public.notification_preferences where customer_id = :'cust_b';

-- staff-style row (user_id set) must be rejected even for own user id
set role authenticated;
set request.jwt.claims = '{"role":"authenticated","sub":"396f6f24-e118-4423-b41e-66a14fc2da90"}';
\echo '(expect: new row violates row-level security policy)'
insert into public.notification_preferences (business_id, customer_id, user_id, channel, enabled)
values (:BIZ_A, :'cust_a', :USER_A, 'email', false);
reset role;
select case when count(*) = 0 then 'PASS' else 'FAIL' end as "customer cannot create staff-scoped rows"
from public.notification_preferences where user_id = :USER_A;

-- ---------- cleanup ----------
\set QUIET on
delete from public.notification_preferences where business_id = :BIZ_A;
delete from public.customers where business_id = :BIZ_A;
delete from public.businesses where id = :BIZ_A;
delete from auth.users where id in (:USER_A, :USER_B);
\set QUIET off
\echo ''
\echo 'done'
