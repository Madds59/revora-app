\set ON_ERROR_STOP off
\pset pager off
\set QUIET on

-- Tenants
\set BIZ_A '''a902dbeb-ff3c-4278-a1a9-fe3b53af7af1'''
\set OWN_A '''396f6f24-e118-4423-b41e-66a14fc2da8f'''
\set BIZ_B '''8771c46d-9198-43dc-a407-70fc39d6c532'''
\set OWN_B '''0e4ac6a6-e404-4169-9ca7-51346ded612e'''

-- ---------- fixtures (as postgres, RLS bypassed) ----------
delete from public.vehicle_inspections where business_id in (:BIZ_A, :BIZ_B);
delete from public.quotations where business_id in (:BIZ_A, :BIZ_B);
delete from public.vehicles where business_id in (:BIZ_A, :BIZ_B);
delete from public.customers where business_id in (:BIZ_A, :BIZ_B);

update public.inspection_template_items set label = 'Front tyre tread depth', section = 'Tyres & wheels'
 where position = 1 and template_id in (select id from public.inspection_templates where business_id = :BIZ_A and is_default);
insert into public.customers (business_id, full_name) values (:BIZ_A, 'Cust A') returning id as cust_a \gset
insert into public.customers (business_id, full_name) values (:BIZ_B, 'Cust B') returning id as cust_b \gset
insert into public.vehicles (business_id, customer_id, make, model, plate_number)
  values (:BIZ_A, :'cust_a', 'Toyota', 'Hilux', 'A-111') returning id as veh_a \gset
insert into public.vehicles (business_id, customer_id, make, model, plate_number)
  values (:BIZ_B, :'cust_b', 'Nissan', 'Patrol', 'B-222') returning id as veh_b \gset

\set QUIET off

\echo ''
\echo '################ T-INTEGRITY ################'
set role authenticated;
set request.jwt.claim.sub = '396f6f24-e118-4423-b41e-66a14fc2da8f';
set request.jwt.claims = '{"role":"authenticated","sub":"396f6f24-e118-4423-b41e-66a14fc2da8f"}';

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
set request.jwt.claim.sub = '0e4ac6a6-e404-4169-9ca7-51346ded612e';
set request.jwt.claims = '{"role":"authenticated","sub":"0e4ac6a6-e404-4169-9ca7-51346ded612e"}';

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
set request.jwt.claim.sub = '396f6f24-e118-4423-b41e-66a14fc2da8f';
set request.jwt.claims = '{"role":"authenticated","sub":"396f6f24-e118-4423-b41e-66a14fc2da8f"}';
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
set request.jwt.claim.sub = '396f6f24-e118-4423-b41e-66a14fc2da8f';
set request.jwt.claims = '{"role":"authenticated","sub":"396f6f24-e118-4423-b41e-66a14fc2da8f"}';
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

\set EMP_A '''3c1f0d24-8a52-4d6f-9b71-2e5c9a04d811'''
\set PORTAL_A '''5b7e2f91-6c34-4a88-9d02-71f3ea55c4b6'''
\set PORTAL_B '''9d4c8e17-2b65-4f39-8c47-3a08bd91e772'''

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  (:EMP_A,    '00000000-0000-0000-0000-000000000000','authenticated','authenticated','dvi-emp-a@example.test','x',now(),now(),now()),
  (:PORTAL_A, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','dvi-cust-a@example.test','x',now(),now(),now()),
  (:PORTAL_B, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','dvi-cust-b@example.test','x',now(),now(),now())
on conflict (id) do nothing;

insert into public.business_members (business_id, user_id, role, is_active)
values (:BIZ_A, :EMP_A, 'employee', true)
on conflict do nothing;

-- Link each portal user to the customer record in its own tenant.
update public.customers set app_user_id = :PORTAL_A where id = :'cust_a';
update public.customers set app_user_id = :PORTAL_B where id = :'cust_b';

select 'FIXTURE_EMPLOYEE_ROLE=' || coalesce(
  (select role::text from public.business_members where business_id = :BIZ_A and user_id = :EMP_A), 'MISSING');

\echo ''
\echo '################ T-EMPLOYEE (role split) ################'
set role authenticated;
set request.jwt.claim.sub = '3c1f0d24-8a52-4d6f-9b71-2e5c9a04d811';
set request.jwt.claims = '{"role":"authenticated","sub":"3c1f0d24-8a52-4d6f-9b71-2e5c9a04d811"}';

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
set request.jwt.claim.sub = '396f6f24-e118-4423-b41e-66a14fc2da8f';
set request.jwt.claims = '{"role":"authenticated","sub":"396f6f24-e118-4423-b41e-66a14fc2da8f"}';
select public.create_inspection(:BIZ_A, :'cust_a', :'veh_a', 'pre_quote') as insp_draft \gset

reset role; set role authenticated;
set request.jwt.claim.sub = '5b7e2f91-6c34-4a88-9d02-71f3ea55c4b6';
set request.jwt.claims = '{"role":"authenticated","sub":"5b7e2f91-6c34-4a88-9d02-71f3ea55c4b6"}';

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
set request.jwt.claim.sub = '9d4c8e17-2b65-4f39-8c47-3a08bd91e772';
set request.jwt.claims = '{"role":"authenticated","sub":"9d4c8e17-2b65-4f39-8c47-3a08bd91e772"}';
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
set request.jwt.claim.sub = '5b7e2f91-6c34-4a88-9d02-71f3ea55c4b6';
set request.jwt.claims = '{"role":"authenticated","sub":"5b7e2f91-6c34-4a88-9d02-71f3ea55c4b6"}';
select 'MEDIA_OWNING_CUSTOMER_ROWS=' || count(*)::text from public.inspection_item_media;

\echo '-- other tenant customer CANNOT (expect 0) --'
reset role; set role authenticated;
set request.jwt.claim.sub = '9d4c8e17-2b65-4f39-8c47-3a08bd91e772';
set request.jwt.claims = '{"role":"authenticated","sub":"9d4c8e17-2b65-4f39-8c47-3a08bd91e772"}';
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
-- Re-establish a live share on the completed inspection (T-SHARE-LIFECYCLE
-- left it revoked). Hashed exactly as lib/inspections/share.ts does: SHA-256
-- over the token's ASCII characters.
update public.vehicle_inspections
   set share_token_hash = sha256(convert_to('anon-probe-token','UTF8')),
       share_created_at = now(),
       share_expires_at = now() + interval '30 days',
       share_revoked_at = null
 where id = :'insp_a';

set request.jwt.claims = '{"role":"anon"}';
set request.jwt.claim.sub = '';
set role anon;

\echo '-- anon CAN resolve a live token (this is the whole feature) --'
select 'ANON_RESOLVE_HEADER_ROWS=' || count(*)::text
from public.resolve_inspection_share(sha256(convert_to('anon-probe-token','UTF8')));
select 'ANON_RESOLVE_ITEM_ROWS=' || (count(*) > 0)::text
from public.resolve_inspection_share_items(sha256(convert_to('anon-probe-token','UTF8')));

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
