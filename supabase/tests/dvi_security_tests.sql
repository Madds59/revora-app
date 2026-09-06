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
\echo ''
\echo '################ DONE ################'
