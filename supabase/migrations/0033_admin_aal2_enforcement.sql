-- APPSEC-10: enforce MFA (AAL2) for platform-admin authority at the DATABASE
-- boundary, not only in Next.js middleware.
--
-- The defect this closes:
--   Before this migration, every privileged admin function was gated solely on
--   platform_admins membership. `is_super_admin()` never read the assurance
--   level, and `grep -rn "aal2|assurance" supabase/migrations/*.sql` returned
--   nothing. The MFA gate added in 0031/app code is a ROUTING control: it stops
--   an aal1 admin reaching /admin in a browser. It does nothing about a stolen
--   admin credential being used to POST /rest/v1/rpc/admin_list_users directly
--   at PostgREST with an aal1 token. That is the admin DATA surface, and it was
--   open. This migration closes it.
--
-- Why this is applied inside is_super_admin() rather than by rewriting each
-- admin_* body:
--   Measured from the live catalog, the privileged surface is 17 functions, not
--   the 14 that match `admin\_%`. The three extras
--   (get_business_revenue_summary, get_business_revenue_trend,
--   list_business_billing_invoices) reach admin authority through
--   `is_super_admin()` as an OR branch. Rewriting only the admin_* bodies would
--   have left those three enforcing the OLD rule, and a future privileged
--   function that reuses the helper would silently inherit the gap again.
--   Tightening the helper covers every present and future caller at one point.
--
-- Why this does NOT lock ordinary business users out:
--   The tenant-scoped functions are guarded as
--     if not is_business_member(p_business_id) and not is_super_admin() ...
--   so a business member still passes on the FIRST branch regardless of their
--   assurance level. Only the platform-admin fallback now requires aal2, which
--   is the intended tightening. Verified before writing this migration:
--   pg_policies contains ZERO policies referencing is_super_admin, so no RLS
--   read path changes behaviour here.
--
-- Why the app's own admin gate is unaffected:
--   apps/web/src/lib/auth.ts:181 resolves admin status by selecting from the
--   platform_admins TABLE, not by calling this function. The UI gate therefore
--   keeps working as defense in depth while the database boundary becomes the
--   authoritative control.
--
-- DEPLOYMENT ORDERING -- READ BEFORE APPLYING TO ANY SHARED DATABASE:
--   Applying this revokes admin DATA access from every platform admin who has
--   not yet enrolled a TOTP factor, because they cannot reach aal2. Enrol and
--   verify every platform_admins member FIRST, confirm hosted MFA is enabled on
--   the project, and only then apply. A rollback is the inverse redefinition of
--   is_super_admin() at the bottom of this file.

-- ---------------------------------------------------------------------------
-- 1. Assurance level, read only from the verified JWT.
-- ---------------------------------------------------------------------------
-- auth.jwt() is the Supabase-verified claim set. The `aal` claim is written by
-- GoTrue after a successful MFA challenge; it is not settable by the client.
-- A missing claim, an absent JWT (service_role, direct SQL, cron) or a malformed
-- value all resolve to NOT-aal2, so this fails CLOSED.
create or replace function public.current_assurance_level()
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(nullif(auth.jwt() ->> 'aal', ''), 'aal1');
$function$;

comment on function public.current_assurance_level() is
  'Assurance level from the verified JWT (aal1/aal2). Missing or absent claim => aal1. Never trust a client-supplied value for this.';

-- ---------------------------------------------------------------------------
-- 2. The authoritative admin check: platform-admin AND aal2.
-- ---------------------------------------------------------------------------
create or replace function public.has_admin_aal2()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid()
  )
  and public.current_assurance_level() = 'aal2';
$function$;

comment on function public.has_admin_aal2() is
  'True only when the caller is a platform admin AND the session satisfied MFA (aal2). This is the authoritative privileged-admin predicate.';

-- Raising form, for call sites that prefer an assertion to a boolean.
create or replace function public.assert_admin_aal2()
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.has_admin_aal2() then
    -- Deliberately identical to the existing 'forbidden' used by every admin_*
    -- function: the caller must not be able to distinguish "not an admin" from
    -- "admin but has not completed MFA". Distinguishing them would confirm to an
    -- attacker holding stolen credentials that the account IS a platform admin.
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$function$;

comment on function public.assert_admin_aal2() is
  'Raises forbidden (42501) unless the caller is a platform admin at aal2. Error is intentionally indistinguishable from the plain not-an-admin case.';

-- ---------------------------------------------------------------------------
-- 3. Tighten the existing helper so all 17 current call sites inherit the rule.
-- ---------------------------------------------------------------------------
-- Signature, volatility, security and return type are unchanged, so every
-- existing caller keeps compiling; only the predicate narrows.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.has_admin_aal2();
$function$;

comment on function public.is_super_admin() is
  'Platform-admin authority. Since 0033 this ALSO requires aal2 (MFA), so the database enforces MFA independently of Next.js middleware. Delegates to has_admin_aal2().';

-- ---------------------------------------------------------------------------
-- 4. Remove the anon EXECUTE grant from every privileged admin function.
-- ---------------------------------------------------------------------------
-- Measured before writing this: all 14 admin_* functions granted EXECUTE to
-- anon in production. That was not directly exploitable (the body rejects anon,
-- since auth.uid() is null) but it is a failed defense-in-depth layer: the only
-- thing standing between an anonymous caller and a privileged function body was
-- one predicate.
--
-- 0003_api_grants.sql sets `alter default privileges ... grant execute on
-- functions to anon, authenticated, service_role`, so this grant is re-created
-- for any NEW function and is a DIRECT grant to anon -- independent of PUBLIC.
-- Revoking from PUBLIC alone would be a silent no-op here; that exact mistake
-- was already made once on this branch. Revoke from both, explicitly.
--
-- `authenticated` is deliberately retained: the application calls these
-- functions as the signed-in user, and authority is decided inside the body by
-- has_admin_aal2(). The grant is not the security boundary; the predicate is.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname like 'admin\_%'
        or p.proname in ('has_admin_aal2', 'assert_admin_aal2', 'current_assurance_level')
      )
  loop
    execute format('revoke all on function %s from public', fn.sig);
    execute format('revoke all on function %s from anon', fn.sig);
    execute format('grant execute on function %s to authenticated', fn.sig);
  end loop;
end;
$$;

-- is_super_admin() itself: same treatment. It only reports on the caller's own
-- session, but an anonymous caller has no legitimate reason to invoke it.
revoke all on function public.is_super_admin() from public;
revoke all on function public.is_super_admin() from anon;
grant execute on function public.is_super_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK (apply as a NEW migration; never edit this file after it ships)
-- ---------------------------------------------------------------------------
-- create or replace function public.is_super_admin()
-- returns boolean language sql stable security definer set search_path to 'public'
-- as $$ select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()); $$;
--
-- That restores pre-0033 behaviour (role check only, no MFA requirement) and is
-- the correct emergency action if platform admins are locked out because hosted
-- MFA is unavailable. It reopens the aal1 PostgREST bypass, so treat it as a
-- temporary measure and re-apply 0033 once enrolment is possible.
