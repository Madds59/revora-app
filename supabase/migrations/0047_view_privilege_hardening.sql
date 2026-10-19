-- ===========================================================================
-- 0047_view_privilege_hardening.sql
--
-- Closes two privilege classes that 0039-0046 reopened. Forward-only and
-- privilege-reducing: no DDL on data, no backfill, nothing dropped.
--
-- CLASS 1 -- A VIEW RUNS AS ITS OWNER
-- On PostgreSQL 15+ a view executes with the privileges of its OWNER unless
-- `security_invoker = true` is set. The owner here is `postgres`, which owns
-- every table, and RLS is never applied to a table's owner. 0043 created
-- public.jobs_missing_vehicle with a comment asserting the opposite -- "the
-- view inherits the RLS of the underlying table for the querying role" -- so
-- the view read public.jobs with row-level security bypassed entirely.
--
-- 0003_api_grants.sql compounded it: `alter default privileges in schema public
-- grant all on tables` applies to VIEWS as well as tables, and PostgreSQL
-- treats a single-table view like this one as auto-updatable
-- (information_schema.views.is_updatable = YES). The view therefore also
-- carried INSERT, UPDATE and DELETE for `anon` and `authenticated`. Net
-- effect: an unauthenticated cross-tenant read, and a cross-tenant write path,
-- through a reporting view. Verified against production before this migration
-- was written.
--
-- public.cross_tenant_reference_audit has the same owner-rights defect. It
-- holds no privileges for either API role, so it was not reachable, but it is
-- corrected here rather than left as the next accident.
--
-- CLASS 2 -- `EXECUTE` COMES BACK THROUGH PUBLIC
-- PostgreSQL grants EXECUTE on every newly created function to PUBLIC. That is
-- the built-in default, and `anon` and `authenticated` are members of PUBLIC.
-- 0038 tried to stop new functions from being anon-callable with
--   alter default privileges in schema public revoke execute on functions from anon;
-- but that only removes 0003's default for the NAMED role `anon`; PostgreSQL's
-- own PUBLIC grant is untouched. Every SECURITY DEFINER function created after
-- 0038 came back anon-callable through PUBLIC, and because the grant never
-- names `anon`, any check that looks for an `anon=X` ACL entry -- as the
-- allowlist assertion in supabase/tests/dvi_security_tests.sql did -- reports
-- the schema clean. The offending ACLs read `=X/postgres`: empty grantee,
-- meaning PUBLIC.
--
-- A SECURITY DEFINER function runs as `postgres`, so EXECUTE on one is a
-- standing authorization decision, reachable as POST /rest/v1/rpc/<name> with
-- the public anon key.
--
-- THE PRIVILEGE MODEL THIS ESTABLISHES
--   * A view is a report. It evaluates RLS as its caller and accepts no writes
--     from an API role.
--   * `anon` executes exactly two SECURITY DEFINER functions, both token-gated
--     (see the allowlist in section D). Everything else must opt in explicitly.
--   * `authenticated` keeps EXECUTE only where a policy, trigger or
--     application contract needs it.
--   * `service_role` is the trusted server-side key and holds `bypassrls`, so
--     the operator diagnostics below keep working unchanged.
--
-- ENFORCEMENT
-- Section F asserts every invariant and raises, so this migration cannot
-- report success against a database where the fix did not take. The same
-- invariants are enforced continuously by
-- apps/web/scripts/audit-view-security.mjs and
-- apps/web/scripts/audit-function-privileges.mjs, both wired into the
-- db-security CI job with their own positive controls.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- A. Make both views evaluate RLS as the caller.
--
-- For `authenticated` this is the whole fix: the view now sees exactly the rows
-- the caller's own policies permit. `service_role` holds bypassrls, so the
-- operator diagnostic is unaffected.
-- ---------------------------------------------------------------------------
alter view public.jobs_missing_vehicle set (security_invoker = true);
alter view public.cross_tenant_reference_audit set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- B. Remove every write path from the API roles, then restore only the reads
--    that are actually needed.
--
-- `revoke all ... from public, anon, authenticated` covers all three routes a
-- privilege can arrive by: the direct grants 0003 made, PostgreSQL's PUBLIC
-- grants, and anything a future replay of 0003's default privileges would add.
-- Revoking only `from anon` would be a no-op against a PUBLIC grant.
-- ---------------------------------------------------------------------------
revoke all on public.jobs_missing_vehicle from public, anon, authenticated;
grant select on public.jobs_missing_vehicle to authenticated, service_role;

-- Operator/service-only diagnostic: it reports rows whose business_id does not
-- match their parent's, across tenants by definition. No API role reads it.
revoke all on public.cross_tenant_reference_audit from public, anon, authenticated;
grant select on public.cross_tenant_reference_audit to service_role;

comment on view public.jobs_missing_vehicle is
  'Jobs with no vehicle_id, for the backfill queue. security_invoker = true, so RLS on public.jobs is evaluated as the CALLER and the view is tenant-scoped; SELECT only. The original 0043 comment claimed a view inherits the underlying RLS automatically -- it does not (0047).';

comment on view public.cross_tenant_reference_audit is
  'Operator diagnostic: child rows whose business_id disagrees with their parent''s. Cross-tenant by construction, so service_role only -- never granted to anon or authenticated. security_invoker = true (0047).';

-- ---------------------------------------------------------------------------
-- C. Close the SECURITY DEFINER functions `anon` reaches through PUBLIC.
--
-- Every signature below is a full identity signature, so an overload can never
-- be hit by accident. `from public, anon` is deliberate and both halves matter:
-- PUBLIC is where the privilege actually comes from today, and the explicit
-- `anon` keeps the revoke correct if 0003's blanket grant is ever replayed.
--
-- These two are tenant-scope predicates used inside RLS policies on
-- public.warranties, public.job_performed_items and public.complaint_evidence.
-- Those policies are declared TO PUBLIC, so the expression is evaluated as
-- whichever role runs the query and `authenticated` MUST keep EXECUTE -- it is
-- preserved by its direct grant below. `anon` is already refused on all three
-- tables upstream (it cannot execute has_business_role or is_business_member),
-- so this revoke takes away no row access it had. What it does take away is the
-- unauthenticated oracle: calling the predicate directly as an RPC to ask
-- "does complaint X belong to business Y?" without any credential.
-- ---------------------------------------------------------------------------
revoke execute on function public.complaint_in_business(uuid, uuid) from public, anon;
revoke execute on function public.quotation_item_in_business(uuid, uuid) from public, anon;

grant execute on function public.complaint_in_business(uuid, uuid) to authenticated, service_role;
grant execute on function public.quotation_item_in_business(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The rest need no API-role EXECUTE at all, so `authenticated` goes too.
--
-- The three trigger functions and the event-trigger function are never called
-- by name. PostgreSQL checks EXECUTE on a trigger function when the TRIGGER is
-- created, not when it fires -- verified directly against this schema: a role
-- holding no EXECUTE performed the DML and the SECURITY DEFINER trigger still
-- ran. Revoking EXECUTE therefore cannot affect trigger behaviour; it only
-- closes the direct-call door.
--
-- recompute_invoice_totals(uuid) is called from inside
-- invoice_items_recompute_header() (SECURITY DEFINER) and from a DO block in
-- 0041. Both run as the definer, so neither consults an API role's privileges.
-- It has zero callers in apps/web/src.
-- ---------------------------------------------------------------------------
revoke execute on function public.recompute_invoice_totals(uuid) from public, anon, authenticated;
revoke execute on function public.enforce_invoice_items_draft_only() from public, anon, authenticated;
revoke execute on function public.enforce_invoice_payment_ceiling() from public, anon, authenticated;
revoke execute on function public.invoice_items_recompute_header() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- D. Correct the default so the class cannot come back.
--
-- NOTE THE ABSENCE OF `IN SCHEMA`. It is the whole point of this statement.
--
-- ALTER DEFAULT PRIVILEGES stores a per-scope entry that PostgreSQL MERGES
-- with its hardcoded built-in default; it does not replace it. The built-in
-- `EXECUTE TO PUBLIC` grant on functions is global, so a schema-scoped revoke
-- has no PUBLIC entry to remove, succeeds silently, and changes nothing.
-- Measured on this schema:
--
--   alter default privileges in schema public revoke execute on functions from public;
--   -- new function ACL: =X/postgres postgres=X/postgres authenticated=X/... -> anon CAN execute
--
--   alter default privileges revoke execute on functions from public;
--   -- new function ACL: postgres=X/postgres authenticated=X/...            -> anon CANNOT execute
--
-- This is 0038's error one level up: the right verb aimed at the wrong scope.
-- Section F asserts the result so a future edit cannot quietly reintroduce the
-- schema-scoped form.
--
-- 0003's IN SCHEMA public default still grants EXECUTE to `authenticated` and
-- `service_role` directly, so ordinary RPCs in public keep working, and 0038's
-- revoke of the `anon` default stays in place. A function that genuinely needs
-- anonymous access must now say so with an explicit `grant execute ... to
-- anon`, exactly as 0037 does for the two inspection-share resolvers.
--
-- SCOPE OF THIS STATEMENT: it is global, so it also applies to objects this
-- role creates OUTSIDE schema public. Nothing existing is affected -- default
-- privileges apply only at creation time -- but a future `create extension` or
-- a function created in another schema by this role will need its grants
-- stated explicitly rather than inherited from PUBLIC. The repo creates one
-- extension (pgcrypto, in 0001, long applied) and calls no non-public
-- functions, so there is nothing to migrate today.
-- ---------------------------------------------------------------------------
alter default privileges revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- E. Record the anonymous allowlist as a comment on each member, so the
--    contract is visible where someone changing the function will read it.
-- ---------------------------------------------------------------------------
comment on function public.resolve_inspection_share(bytea) is
  'Anonymous by design (1 of 2 on the allowlist): resolves a shared inspection from the token hash alone and returns nothing without a valid, unexpired, unrevoked token. Enforced by apps/web/scripts/audit-function-privileges.mjs.';

comment on function public.resolve_inspection_share_items(bytea) is
  'Anonymous by design (2 of 2 on the allowlist): returns the item rows for a token-resolved inspection. Enforced by apps/web/scripts/audit-function-privileges.mjs.';

-- ---------------------------------------------------------------------------
-- F. Fail closed. A migration that silently did nothing is the failure mode
--    this whole change exists to prevent, so assert the end state.
-- ---------------------------------------------------------------------------
do $$
declare
  offender text;
  v_default_acl aclitem[];
begin
  -- F1. Every ordinary view in public evaluates RLS as its caller.
  select string_agg(c.relname, ', ' order by c.relname) into offender
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'v'
     and coalesce(c.reloptions::text, '') not like '%security_invoker=true%';
  if offender is not null then
    raise exception
      'VIEW-01: view(s) still run with owner rights and bypass RLS: %', offender;
  end if;

  -- F2. No EFFECTIVE write privilege for either API role on any public view,
  --     whether granted directly, through PUBLIC, or by inheritance.
  select string_agg(format('%s:%s:%s', c.relname, r.role, p.priv), ', ') into offender
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace,
         (values ('anon'), ('authenticated')) as r(role),
         (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as p(priv)
   where n.nspname = 'public'
     and c.relkind = 'v'
     and has_table_privilege(r.role, c.oid, p.priv);
  if offender is not null then
    raise exception
      'VIEW-02: API role(s) still hold write privileges on a view: %', offender;
  end if;

  -- F3. anon executes nothing outside the two-function allowlist.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into offender
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and p.oid::regprocedure::text not in (
       'resolve_inspection_share(bytea)',
       'resolve_inspection_share_items(bytea)',
       'public.resolve_inspection_share(bytea)',
       'public.resolve_inspection_share_items(bytea)'
     );
  if offender is not null then
    raise exception
      'FUNC-01: anon can still execute non-allowlisted SECURITY DEFINER function(s): %', offender;
  end if;

  -- F4. The allowlist itself still works. Closing the hole by breaking the
  --     public share link would not be a fix.
  if not has_function_privilege('anon', 'public.resolve_inspection_share(bytea)', 'EXECUTE') then
    raise exception 'FUNC-02: resolve_inspection_share(bytea) is no longer executable by anon';
  end if;
  if not has_function_privilege('anon', 'public.resolve_inspection_share_items(bytea)', 'EXECUTE') then
    raise exception 'FUNC-03: resolve_inspection_share_items(bytea) is no longer executable by anon';
  end if;

  -- F5. The roles that must keep working, still do.
  if not has_table_privilege('authenticated', 'public.jobs_missing_vehicle', 'SELECT') then
    raise exception 'VIEW-03: authenticated lost SELECT on jobs_missing_vehicle';
  end if;
  if not has_table_privilege('service_role', 'public.cross_tenant_reference_audit', 'SELECT') then
    raise exception 'VIEW-04: service_role lost SELECT on cross_tenant_reference_audit';
  end if;
  if not has_function_privilege('authenticated', 'public.complaint_in_business(uuid,uuid)', 'EXECUTE') then
    raise exception 'FUNC-04: authenticated lost EXECUTE on complaint_in_business, which its RLS policies call';
  end if;
  if not has_function_privilege('authenticated', 'public.quotation_item_in_business(uuid,uuid)', 'EXECUTE') then
    raise exception 'FUNC-05: authenticated lost EXECUTE on quotation_item_in_business, which its RLS policies call';
  end if;

  -- F6. The future default is actually closed. Catalog-level, so it runs
  --     without creating a probe object; the behavioural proof lives in
  --     apps/web/scripts/audit-function-privileges.mjs' CI gate, which creates
  --     a function after this migration and requires anon to be refused.
  select defaclacl into v_default_acl
    from pg_default_acl
   where defaclobjtype = 'f'
     and defaclnamespace = 0
     and defaclrole = current_user::regrole;
  if v_default_acl is null then
    raise exception
      'FUNC-06: no GLOBAL default-privilege entry for functions exists for %, so PostgreSQL''s built-in EXECUTE-to-PUBLIC grant is still in force. A schema-scoped revoke cannot remove it.',
      current_user;
  end if;
  if exists (select 1 from unnest(v_default_acl) a where a::text like '=%') then
    raise exception
      'FUNC-07: the global default for functions still grants EXECUTE to PUBLIC: %',
      array_to_string(v_default_acl, ' ');
  end if;

  raise log '0047: view and function privilege invariants asserted';
end;
$$;
