\set ON_ERROR_STOP off
\pset pager off
\set QUIET on

-- ============================================================================
-- Digital Vehicle Inspection (DVI) — database security harness
--
-- WHAT THIS IS
-- Behavioural tests for migration 0037 and the authorization boundary the DVI
-- application layer sits on. Named assertions print as `KEY=value`; cases that
-- must be refused print a psql ERROR, which is the pass condition for them.
-- The assertion names are cited by name from docs/security/ — renaming one
-- silently falsifies a security document, so treat them as a public contract.
--
-- HOW TO RUN (local Supabase stack, from the repo root)
--   docker exec -i supabase_db_Revora-app psql -U postgres \
--     -f - < supabase/tests/dvi_security_tests.sql
--
-- Read the output for `KEY=value` lines and for ERRORs next to the `--
-- must be REJECTED/DENIED --` banners. See docs/security/MULTI_TENANT_TEST_MATRIX.md
-- (cases 15–26) for what each one proves.
--
-- REQUIREMENTS
-- A database with migrations applied through 0037. Nothing else: the harness
-- seeds every tenant, user and record it needs.
--
-- NEVER RUN THIS AGAINST PRODUCTION.
-- It runs as `postgres` (RLS bypassed) and it deletes rows. Those deletes are
-- scoped to the two fixture tenants below, which the harness creates and owns,
-- so on a correct target it cannot touch real data — but it is still a
-- destructive script pointed at whatever database you hand it.
--
-- FIXTURE OWNERSHIP
-- Every id below is dedicated to this harness (the `d71c0a3e` prefix marks
-- them). An earlier version of this file borrowed two real businesses that
-- happened to exist on one developer's machine and deleted their customers,
-- vehicles and quotations on every run; it also could not run anywhere else.
-- Self-seeding fixes both problems.
-- ============================================================================

-- Fixture tenants
\set BIZ_A '''d71c0a3e-0001-4a00-8000-000000000001'''
\set BIZ_B '''d71c0a3e-0002-4a00-8000-000000000002'''

-- Fixture identities. Each actor needs its id twice: once bare for SQL, once
-- inside the JWT claims JSON. Defining both here keeps the uuid out of the
-- body, where it previously appeared up to nine times per actor.
\set OWN_A '''d71c0a3e-1001-4a00-8000-000000000001'''
\set OWN_A_JWT '''{"role":"authenticated","sub":"d71c0a3e-1001-4a00-8000-000000000001"}'''
\set OWN_B '''d71c0a3e-1002-4a00-8000-000000000002'''
\set OWN_B_JWT '''{"role":"authenticated","sub":"d71c0a3e-1002-4a00-8000-000000000002"}'''
\set EMP_A '''d71c0a3e-1003-4a00-8000-000000000003'''
\set EMP_A_JWT '''{"role":"authenticated","sub":"d71c0a3e-1003-4a00-8000-000000000003"}'''
\set PORTAL_A '''d71c0a3e-1004-4a00-8000-000000000004'''
\set PORTAL_A_JWT '''{"role":"authenticated","sub":"d71c0a3e-1004-4a00-8000-000000000004"}'''
\set PORTAL_B '''d71c0a3e-1005-4a00-8000-000000000005'''
\set PORTAL_B_JWT '''{"role":"authenticated","sub":"d71c0a3e-1005-4a00-8000-000000000005"}'''

-- ---------- preflight ----------
-- Fail immediately and legibly on a wrong target, instead of emitting a
-- confusing cascade of errors forty lines in.
\set ON_ERROR_STOP on
do $preflight$
declare
  missing text;
begin
  select string_agg(t, ', ') into missing
  from unnest(array[
    'inspection_templates','inspection_template_items',
    'vehicle_inspections','inspection_items','inspection_item_media'
  ]) as t
  where to_regclass('public.' || t) is null;

  if missing is not null then
    raise exception
      'DVI schema missing (%). Apply migrations through 0037 before running this harness.',
      missing;
  end if;

  if to_regprocedure('public.resolve_inspection_share(bytea)') is null then
    raise exception 'migration 0037 functions are absent -- apply it first';
  end if;
end
$preflight$;
\set ON_ERROR_STOP off

-- ---------- fixtures (as postgres, RLS bypassed) ----------
-- ON_ERROR_STOP stays ON for setup. The tests themselves need it OFF (a rejected
-- write IS a pass there), but a broken FIXTURE must abort immediately: a failed
-- insert leaves the following \gset unset, and every later :'cust_a' then
-- degrades into "syntax error at or near :" -- forty lines of noise hiding one
-- real cause.
\set ON_ERROR_STOP on
reset role;

-- Tenants. Inserting a business fires businesses_seed_inspection_template,
-- which seeds that tenant's default 20-item checklist -- asserted below.
insert into public.businesses (id, name) values
  (:BIZ_A, 'DVI Harness Tenant A'),
  (:BIZ_B, 'DVI Harness Tenant B')
on conflict (id) do nothing;

-- Identities. The profiles row is created by the auth.users trigger; inserting
-- into public.profiles directly collides with it.
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  (:OWN_A,    '00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-a@dvi-harness.invalid','x',now(),now(),now()),
  (:OWN_B,    '00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-b@dvi-harness.invalid','x',now(),now(),now()),
  (:EMP_A,    '00000000-0000-0000-0000-000000000000','authenticated','authenticated','employee-a@dvi-harness.invalid','x',now(),now(),now()),
  (:PORTAL_A, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','customer-a@dvi-harness.invalid','x',now(),now(),now()),
  (:PORTAL_B, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','customer-b@dvi-harness.invalid','x',now(),now(),now())
-- Untargeted: tolerates a re-run hitting EITHER the id or the email unique index.
on conflict do nothing;

insert into public.business_members (business_id, user_id, role, is_active) values
  (:BIZ_A, :OWN_A, 'business_owner', true),
  (:BIZ_B, :OWN_B, 'business_owner', true),
  (:BIZ_A, :EMP_A, 'employee', true)
on conflict do nothing;

-- Per-run data. Scoped to the fixture tenants only, so a repeat run resets the
-- harness without touching anything else in the database.
delete from public.vehicle_inspections where business_id in (:BIZ_A, :BIZ_B);
delete from public.quotations where business_id in (:BIZ_A, :BIZ_B);
delete from public.vehicles where business_id in (:BIZ_A, :BIZ_B);
delete from public.customers where business_id in (:BIZ_A, :BIZ_B);

-- Normalize position 1 so T-SNAPSHOT asserts against a known label regardless
-- of the tenant's default_language.
update public.inspection_template_items set label = 'Front tyre tread depth', section = 'Tyres & wheels'
 where position = 1 and template_id in (select id from public.inspection_templates where business_id = :BIZ_A and is_default);

insert into public.customers (business_id, full_name, app_user_id)
  values (:BIZ_A, 'Cust A', :PORTAL_A) returning id as cust_a \gset
insert into public.customers (business_id, full_name, app_user_id)
  values (:BIZ_B, 'Cust B', :PORTAL_B) returning id as cust_b \gset
insert into public.vehicles (business_id, customer_id, make, model, plate_number)
  values (:BIZ_A, :'cust_a', 'Toyota', 'Hilux', 'A-111') returning id as veh_a \gset
insert into public.vehicles (business_id, customer_id, make, model, plate_number)
  values (:BIZ_B, :'cust_b', 'Nissan', 'Patrol', 'B-222') returning id as veh_b \gset

-- Fixtures are up; from here a raised error is often the assertion itself.
\set ON_ERROR_STOP off

\set QUIET off

\echo ''
\echo '################ T-INTEGRITY ################'
set role authenticated;
set request.jwt.claim.sub = :OWN_A;
set request.jwt.claims = :OWN_A_JWT;

\echo '-- cross-tenant vehicle must be REJECTED --'
select public.create_inspection(:BIZ_A, :'cust_a', :'veh_b', 'pre_quote');

\echo '-- in_job without a job must be REJECTED --'
select public.create_inspection(:BIZ_A, :'cust_a', :'veh_a', 'in_job');

\echo '-- valid pre_quote inspection SUCCEEDS --'
select public.create_inspection(:BIZ_A, :'cust_a', :'veh_a', 'pre_quote') as insp_a \gset
select 'ITEMS_SNAPSHOTTED=' || count(*)::text from public.inspection_items where inspection_id = :'insp_a';

\echo ''
\echo '################ T-TENANCY (G5) ################'
reset role; set role authenticated;
set request.jwt.claim.sub = :OWN_B;
set request.jwt.claims = :OWN_B_JWT;

\echo '-- Owner B reading A inspections: expect 0 rows --'
select 'CROSS_TENANT_READ_ROWS=' || count(*)::text from public.vehicle_inspections where business_id = :BIZ_A;

\echo '-- Owner B writing into A: expect REJECTED --'
insert into public.vehicle_inspections (business_id, customer_id, vehicle_id, context)
  values (:BIZ_A, :'cust_a', :'veh_a', 'pre_quote');

\echo '-- Owner B completing A''s inspection: expect REJECTED --'
select public.complete_inspection(:'insp_a');

\echo ''
\echo '################ T-SNAPSHOT (G9) ################'
reset role;
update public.inspection_template_items
   set label = 'MUTATED LABEL', section = 'MUTATED SECTION'
 where template_id = (select id from public.inspection_templates where business_id = :BIZ_A and is_default)
   and position = 1;
select 'SNAPSHOT_LABEL_AFTER_TEMPLATE_EDIT=' ||
       (select label from public.inspection_items where inspection_id = :'insp_a' and position = 1);

\echo ''
\echo '################ T-SHARE-DRAFT (G7) ################'
set role authenticated;
set request.jwt.claim.sub = :OWN_A;
set request.jwt.claims = :OWN_A_JWT;
\echo '-- sharing a DRAFT must be REJECTED --'
select public.set_inspection_share(:'insp_a', sha256('tok-draft'::bytea), now() + interval '30 days');

\echo ''
\echo '################ T-COMPLETE ################'
update public.inspection_items set result = 'fail', note = 'Worn to 2mm'
  where inspection_id = :'insp_a' and position = 1;
update public.inspection_items set result = 'attention', note = 'Weeping slightly'
  where inspection_id = :'insp_a' and position = 13;
select 'COMPLETED_STATUS=' || (public.complete_inspection(:'insp_a', 'Two items need attention')).status::text;

\echo ''
\echo '################ T-IMMUTABLE (G10) ################'
\echo '-- editing an item of a COMPLETED inspection must be REJECTED --'
update public.inspection_items set result = 'pass' where inspection_id = :'insp_a' and position = 1;
\echo '-- editing the completed header must be REJECTED --'
update public.vehicle_inspections set summary = 'tampered' where id = :'insp_a';

\echo ''
\echo '################ T-SHARE-LIFECYCLE (G8) ################'
select public.set_inspection_share(:'insp_a', sha256('tok-good'::bytea), now() + interval '30 days');
\echo '-- valid token resolves (expect 1) --'
select 'VALID_TOKEN_ROWS=' || count(*)::text from public.resolve_inspection_share(sha256('tok-good'::bytea));
\echo '-- unknown token resolves to nothing (expect 0) --'
select 'UNKNOWN_TOKEN_ROWS=' || count(*)::text from public.resolve_inspection_share(sha256('tok-wrong'::bytea));

\echo '-- ROTATION invalidates the previous token --'
select public.set_inspection_share(:'insp_a', sha256('tok-rotated'::bytea), now() + interval '30 days');
select 'AFTER_ROTATION_OLD_TOKEN_ROWS=' || count(*)::text from public.resolve_inspection_share(sha256('tok-good'::bytea));
select 'AFTER_ROTATION_NEW_TOKEN_ROWS=' || count(*)::text from public.resolve_inspection_share(sha256('tok-rotated'::bytea));

\echo '-- EXPIRY invalidates --'
select public.set_inspection_share(:'insp_a', sha256('tok-expired'::bytea), now() - interval '1 day');
select 'EXPIRED_TOKEN_ROWS=' || count(*)::text from public.resolve_inspection_share(sha256('tok-expired'::bytea));

\echo '-- REVOCATION invalidates --'
select public.set_inspection_share(:'insp_a', sha256('tok-revoke'::bytea), now() + interval '30 days');
select public.revoke_inspection_share(:'insp_a');
select 'REVOKED_TOKEN_ROWS=' || count(*)::text from public.resolve_inspection_share(sha256('tok-revoke'::bytea));

\echo ''
\echo '################ T-TOKEN-STORAGE (G6) ################'
reset role;
select 'SHARE_COLS=' || string_agg(column_name || ':' || data_type, ', ' order by column_name)
from information_schema.columns
where table_schema='public' and table_name='vehicle_inspections' and column_name like 'share%';
\echo '-- no column anywhere stores a plaintext token --'
select 'PLAINTEXT_TOKEN_COLUMNS=' || count(*)::text from information_schema.columns
where table_schema='public' and table_name='vehicle_inspections'
  and column_name like '%token%' and data_type <> 'bytea';

\echo ''
\echo '################ T-QUOTE (G11/G12) ################'
set role authenticated;
set request.jwt.claim.sub = :OWN_A;
set request.jwt.claims = :OWN_A_JWT;
select array_agg(id) as finding_ids from public.inspection_items
  where inspection_id = :'insp_a' and result in ('attention','fail') \gset
select public.create_quotation_from_inspection(:'insp_a', :'finding_ids') as q1 \gset
select 'QUOTE_LINES=' || count(*)::text ||
       ' ZERO_PRICED=' || count(*) filter (where unit_price = 0)::text ||
       ' WITH_PROVENANCE=' || count(*) filter (where source_inspection_item_id is not null)::text
from public.quotation_items where quotation_id = :'q1';

\echo '-- second invocation must return the SAME quotation (idempotent) --'
select public.create_quotation_from_inspection(:'insp_a', :'finding_ids') as q2 \gset
select 'IDEMPOTENT=' || (:'q1' = :'q2')::text;
select 'TOTAL_QUOTES_FOR_BUSINESS=' || count(*)::text from public.quotations where business_id = :BIZ_A;

\echo ''
\echo '################ T-ANON (G13 privileged fn) ################'
reset role;
set request.jwt.claims = '{"role":"anon"}';
set request.jwt.claim.sub = '';
set role anon;
select 'ANON_AUTH_UID_IS_NULL=' || (auth.uid() is null)::text;
\echo '-- anon calling create_inspection must be DENIED --'
select public.create_inspection(:BIZ_A, :'cust_a', :'veh_a', 'pre_quote');
\echo '-- anon calling complete_inspection must be DENIED --'
select public.complete_inspection(:'insp_a');
\echo '-- anon calling set_inspection_share must be DENIED --'
select public.set_inspection_share(:'insp_a', sha256('x'::bytea), now());
\echo '-- anon SELECT on inspections must return 0 rows --'
select 'ANON_DIRECT_SELECT_ROWS=' || count(*)::text from public.vehicle_inspections;

reset role;
-- =====================================================================
-- APPLICATION-LAYER COVERAGE (DVI V1 UI)
--
-- Everything below pins a database behaviour that the application layer
-- built on top of 0037 relies on. Each case exists because a specific
-- application decision would be unsafe if the database did not enforce it:
--
--   T-EMPLOYEE   lib/permissions.ts splits canManageInspections (owner/
--                manager/employee) from canShareInspections and
--                canManageQuotes (owner/manager). Those helpers are UI
--                gating only -- these cases prove the RPCs refuse an
--                employee even when the UI check is bypassed.
--   T-PORTAL     the portal read model (lib/inspections/data.ts) filters
--                to completed + own customer ids in application code.
--                These cases prove RLS refuses everything else anyway.
--   T-MEDIA      inspection photos are signed with the SERVICE ROLE after
--                a data-layer check, so the junction table's RLS is what
--                decides who may learn a photo exists at all.
--   T-ANON-*     the public share route is unauthenticated. These cases
--                pin exactly which functions anon may call, and prove the
--                public payload carries no customer identifier.
-- =====================================================================

\echo ''
\echo '################ T-APP-FIXTURES ################'
reset role;

-- Every actor and tenant is seeded at the top of this file. These assertions
-- confirm the environment the rest of the suite assumes, so a failure here is
-- read as "the fixtures did not take", not as a security finding.
select 'FIXTURE_TENANTS=' || count(*)::text
from public.businesses where id in (:BIZ_A, :BIZ_B);

select 'FIXTURE_OWNER_A_ROLE=' || coalesce(
  (select role::text from public.business_members where business_id = :BIZ_A and user_id = :OWN_A), 'MISSING');

select 'FIXTURE_EMPLOYEE_ROLE=' || coalesce(
  (select role::text from public.business_members where business_id = :BIZ_A and user_id = :EMP_A), 'MISSING');

select 'FIXTURE_PORTAL_LINKED=' || count(*)::text
from public.customers where id in (:'cust_a', :'cust_b') and app_user_id is not null;

\echo '-- creating a business must auto-seed its default checklist (0037 trigger) --'
-- The spec claims new businesses are seeded with the default 20-item workshop
-- checklist via a trigger on `businesses`. Nothing exercised that until the
-- harness began creating its own tenants; now it is covered for free.
select 'SEEDED_DEFAULT_TEMPLATES=' || count(*)::text
from public.inspection_templates
where business_id in (:BIZ_A, :BIZ_B) and is_default and is_active;

select 'SEEDED_TEMPLATE_ITEMS_A=' || count(*)::text
from public.inspection_template_items
where template_id = (select id from public.inspection_templates
                      where business_id = :BIZ_A and is_default limit 1);

\echo '-- the seeded checklist is per-tenant, never shared across businesses --'
select 'SEEDED_TEMPLATES_ARE_DISTINCT=' || (
  (select id from public.inspection_templates where business_id = :BIZ_A and is_default limit 1)
  is distinct from
  (select id from public.inspection_templates where business_id = :BIZ_B and is_default limit 1)
)::text;

\echo '################ T-EMPLOYEE (role split) ################'
set role authenticated;
set request.jwt.claim.sub = :EMP_A;
set request.jwt.claims = :EMP_A_JWT;

\echo '-- employee CAN start a draft inspection --'
select public.create_inspection(:BIZ_A, :'cust_a', :'veh_a', 'pre_quote') as insp_emp \gset
select 'EMPLOYEE_CREATED_ITEMS=' || count(*)::text from public.inspection_items where inspection_id = :'insp_emp';

\echo '-- employee CAN record a result on their draft --'
update public.inspection_items set result = 'attention', note = 'Employee note'
  where inspection_id = :'insp_emp' and position = 1;
select 'EMPLOYEE_ITEM_RESULT=' ||
  (select result::text from public.inspection_items where inspection_id = :'insp_emp' and position = 1);

\echo '-- employee CAN complete --'
select 'EMPLOYEE_COMPLETED=' || (public.complete_inspection(:'insp_emp', 'Employee summary')).status::text;

\echo '-- employee sharing must be REJECTED (owner/manager only) --'
select public.set_inspection_share(:'insp_emp', sha256('emp-token'::bytea), now() + interval '30 days');

\echo '-- employee revoking must be REJECTED --'
select public.revoke_inspection_share(:'insp_emp');

\echo '-- employee converting findings to a quotation must be REJECTED --'
select public.create_quotation_from_inspection(
  :'insp_emp',
  array(select id from public.inspection_items
         where inspection_id = :'insp_emp' and result in ('attention','fail')));

\echo ''
\echo '################ T-PORTAL (customer read model) ################'
reset role;
-- A draft belonging to customer A, to prove drafts stay invisible.
set role authenticated;
set request.jwt.claim.sub = :OWN_A;
set request.jwt.claims = :OWN_A_JWT;
select public.create_inspection(:BIZ_A, :'cust_a', :'veh_a', 'pre_quote') as insp_draft \gset

reset role; set role authenticated;
set request.jwt.claim.sub = :PORTAL_A;
set request.jwt.claims = :PORTAL_A_JWT;

\echo '-- customer sees ONLY completed inspections (drafts excluded) --'
select 'PORTAL_VISIBLE_TOTAL=' || count(*)::text ||
       ' COMPLETED=' || count(*) filter (where status = 'completed')::text ||
       ' DRAFTS=' || count(*) filter (where status = 'draft')::text
from public.vehicle_inspections;

\echo '-- the specific draft is NOT readable (expect 0) --'
select 'PORTAL_DRAFT_ROWS=' || count(*)::text
from public.vehicle_inspections where id = :'insp_draft';

\echo '-- customer CAN read the items of their completed inspection --'
select 'PORTAL_ITEM_ROWS=' || (count(*) > 0)::text
from public.inspection_items where inspection_id = :'insp_a';

\echo '-- customer CANNOT edit their own report --'
-- RLS makes this a silent 0-row UPDATE rather than an error (the row is not
-- visible to the UPDATE's USING clause), so assert the ROW COUNT and the
-- surviving value: "no exception raised" would pass even if the write landed.
with attempted as (
  update public.inspection_items set note = 'customer tampering'
   where inspection_id = :'insp_a' returning 1
)
select 'PORTAL_TAMPER_ROWS_WRITTEN=' || count(*)::text from attempted;
select 'PORTAL_TAMPER_LEAKED=' ||
       (count(*) filter (where note = 'customer tampering'))::text
from public.inspection_items where inspection_id = :'insp_a';

\echo '-- customer CANNOT complete or share anything --'
select public.complete_inspection(:'insp_draft');
select public.set_inspection_share(:'insp_a', sha256('cust-token'::bytea), now() + interval '30 days');

\echo '-- OTHER tenant customer sees none of business A (expect 0) --'
reset role; set role authenticated;
set request.jwt.claim.sub = :PORTAL_B;
set request.jwt.claims = :PORTAL_B_JWT;
select 'PORTAL_CROSS_TENANT_ROWS=' || count(*)::text
from public.vehicle_inspections where business_id = :BIZ_A;

\echo ''
\echo '################ T-MEDIA (photo visibility) ################'
reset role;
-- A photo attached to a finding on the COMPLETED inspection, written the way
-- recordInspectionItemPhoto writes it: resource-bound v2 path, private bucket,
-- purpose 'inspection_item'.
select id as finding_item from public.inspection_items
  where inspection_id = :'insp_a' and result = 'fail' order by position limit 1 \gset

insert into public.media_assets
  (business_id, bucket, object_path, file_name, mime_type, size_bytes, purpose, visibility)
values
  (:BIZ_A, 'revora-private',
   :BIZ_A || '/inspection-item/' || :'finding_item' || '/00000000-0000-4000-8000-000000000000-tyre.jpg',
   'tyre.jpg', 'image/jpeg', 1234, 'inspection_item', 'private')
returning id as asset_a \gset

insert into public.inspection_item_media (business_id, inspection_item_id, media_asset_id)
values (:BIZ_A, :'finding_item', :'asset_a') returning id as link_a \gset

select 'MEDIA_PATH_IS_RESOURCE_BOUND=' ||
  (array_length(string_to_array(object_path,'/'),1) = 4)::text
from public.media_assets where id = :'asset_a';

\echo '-- owning customer CAN see the photo link (expect 1) --'
set role authenticated;
set request.jwt.claim.sub = :PORTAL_A;
set request.jwt.claims = :PORTAL_A_JWT;
select 'MEDIA_OWNING_CUSTOMER_ROWS=' || count(*)::text from public.inspection_item_media;

\echo '-- other tenant customer CANNOT (expect 0) --'
reset role; set role authenticated;
set request.jwt.claim.sub = :PORTAL_B;
set request.jwt.claims = :PORTAL_B_JWT;
select 'MEDIA_CROSS_TENANT_ROWS=' || count(*)::text from public.inspection_item_media;

\echo '-- anonymous CANNOT (expect 0) --'
reset role;
set request.jwt.claims = '{"role":"anon"}';
set request.jwt.claim.sub = '';
set role anon;
select 'MEDIA_ANON_ROWS=' || count(*)::text from public.inspection_item_media;

\echo ''
\echo '################ T-ANON-RESOLVER (public share payload) ################'
reset role;
-- Re-establish a live share on the completed inspection (T-SHARE-LIFECYCLE left
-- it revoked). Hashed exactly as lib/inspections/share.ts does: SHA-256 over the
-- token's ASCII characters.
--
-- The token is derived from the inspection id rather than being a fixed literal.
-- `vehicle_inspections_share_hash_idx` is UNIQUE across the whole table, so a
-- constant probe token collides with any other row that ever used it -- including
-- rows in other tenants left behind by an earlier run. When that happened the
-- UPDATE failed and the resolver then matched the OTHER tenant's inspection, so
-- the row-count assertion below passed for entirely the wrong reason. Deriving
-- the token per inspection makes a collision impossible, and the identity
-- assertion catches it if one ever occurs anyway.
\set PROBE_TOKEN '''anon-probe-'''
update public.vehicle_inspections
   set share_token_hash = sha256(convert_to(:PROBE_TOKEN || :'insp_a', 'UTF8')),
       share_created_at = now(),
       share_expires_at = now() + interval '30 days',
       share_revoked_at = null
 where id = :'insp_a';

set request.jwt.claims = '{"role":"anon"}';
set request.jwt.claim.sub = '';
set role anon;

\echo '-- anon CAN resolve a live token (this is the whole feature) --'
select 'ANON_RESOLVE_HEADER_ROWS=' || count(*)::text
from public.resolve_inspection_share(sha256(convert_to(:PROBE_TOKEN || :'insp_a', 'UTF8')));

\echo '-- and it resolves OUR inspection, not some other row sharing the hash --'
select 'ANON_RESOLVE_IS_FIXTURE=' || (
  (select inspection_id
     from public.resolve_inspection_share(sha256(convert_to(:PROBE_TOKEN || :'insp_a','UTF8'))))
  = :'insp_a'::uuid)::text;

select 'ANON_RESOLVE_ITEM_ROWS=' || (count(*) > 0)::text
from public.resolve_inspection_share_items(sha256(convert_to(:PROBE_TOKEN || :'insp_a', 'UTF8')));

\echo '-- the public payload carries NO customer or tenant identifier --'
reset role;
select 'PUBLIC_HEADER_COLUMNS=' || string_agg(p.name, ',' order by p.ord)
from pg_proc f,
     lateral unnest(f.proallargtypes, f.proargnames) with ordinality as p(typ, name, ord)
where f.proname = 'resolve_inspection_share'
  and f.pronamespace = 'public'::regnamespace
  and p.name is not null and p.name <> 'target_token_hash';

select 'PUBLIC_PAYLOAD_LEAKS=' || count(*)::text
from pg_proc f,
     lateral unnest(f.proargnames) as n(name)
where f.proname in ('resolve_inspection_share','resolve_inspection_share_items')
  and f.pronamespace = 'public'::regnamespace
  and (n.name ilike '%customer%' or n.name ilike '%business_id%'
       or n.name ilike '%price%' or n.name ilike '%phone%'
       or n.name ilike '%email%' or n.name ilike '%object_path%');

\echo ''
\echo '################ T-ANON-DENIED (new surfaces) ################'
set request.jwt.claims = '{"role":"anon"}';
set request.jwt.claim.sub = '';
set role anon;
\echo '-- anon calling revoke_inspection_share must be DENIED --'
select public.revoke_inspection_share(:'insp_a');
\echo '-- anon calling create_quotation_from_inspection must be DENIED --'
select public.create_quotation_from_inspection(:'insp_a', array[:'finding_item']::uuid[]);
\echo '-- anon SELECT on inspection_items must return 0 rows --'
select 'ANON_ITEM_SELECT_ROWS=' || count(*)::text from public.inspection_items;
\echo '-- anon SELECT on inspection_templates must return 0 rows --'
select 'ANON_TEMPLATE_SELECT_ROWS=' || count(*)::text from public.inspection_templates;

\echo '-- no DVI function is executable by anon except the two resolvers --'
-- Supabase DEFAULT PRIVILEGES grant EXECUTE on every new public function to the
-- anon ROLE, so `revoke ... from public` alone does nothing. This asserts the
-- EXACT allowlist rather than merely listing it: adding a DVI function without
-- an explicit `revoke ... from public, anon` fails this case.
reset role;
select 'ANON_EXECUTABLE_DVI_FUNCTIONS=' ||
       coalesce(string_agg(proname, ',' order by proname), 'NONE')
from pg_proc
where pronamespace = 'public'::regnamespace
  and (proname like '%inspection%')
  and array_to_string(proacl, ' ') like '%anon=X%';

select 'ANON_FUNCTION_ALLOWLIST_EXACT=' || (
  coalesce((select string_agg(proname, ',' order by proname)
            from pg_proc
            where pronamespace = 'public'::regnamespace
              and proname like '%inspection%'
              and array_to_string(proacl, ' ') like '%anon=X%'), 'NONE')
  = 'resolve_inspection_share,resolve_inspection_share_items')::text;

reset role;

\echo ''
\echo '################ DONE ################'
