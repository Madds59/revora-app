-- ===========================================================================
-- MFA assurance-level helpers for platform-admin authority.
-- Ported from security/appsec-10-auth-hardening's 0033 (APPSEC-10 Task 7),
-- renumbered above the applied 0034-0043 -- and deliberately INCOMPLETE.
--
-- WHAT THE SOURCE MIGRATION DID, AND WHY THIS ONE STOPS SHORT
-- The original redefined is_super_admin() to require aal2, closing a real
-- hole: the MFA gate in middleware is a ROUTING control and does nothing about
-- a stolen admin credential used to POST /rest/v1/rpc/admin_list_users
-- directly at PostgREST with an aal1 token. That is the admin DATA surface.
--
-- Its own header carries the warning that matters here:
--
--     "Applying this revokes admin DATA access from every platform admin who
--      has not yet enrolled a TOTP factor, because they cannot reach aal2.
--      Enrol and verify every platform_admins member FIRST."
--
-- Measured against production before writing this file:
--
--     platform_admins .................. 2
--     verified MFA factors ............. 0
--     admins with a verified factor .... 0
--
-- So redefining is_super_admin() today locks BOTH platform admins out of all
-- admin data the moment the migration lands, with no enrolled factor to
-- recover through. That is not a security improvement, it is an outage -- and
-- the brief is explicit that MFA work blocked on enrolment decisions should be
-- completed up to the decision and then handed over, not forced through.
--
-- This migration therefore ships everything that is safe:
--   * the assurance-level predicates, so the rule exists and is testable;
--   * a readiness function that says exactly when the tightening is safe.
--
-- It does NOT redefine is_super_admin(). That one statement is the owner's to
-- apply, after enrolment, and is recorded in
-- docs/security/MIGRATION_RELEASE_SOP.md section 9 with its preconditions.
--
-- WHAT WAS DROPPED FROM THE ORIGINAL, as obsolete
-- 0033 also revoked EXECUTE from anon on all 14 admin_* functions, on the
-- measured basis that production granted it. That is no longer true: both
-- production (has_function_privilege) and a schema built from these migrations
-- (raw proacl = postgres=X,authenticated=X,service_role=X -- anon and PUBLIC
-- both absent) show anon cannot execute them. Porting a revoke of a privilege
-- nobody holds would add noise and imply a fix that was not needed.
--
-- FORWARD-ONLY and idempotent.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Assurance level, read only from the verified JWT.
--
-- auth.jwt() is the Supabase-verified claim set. `aal` is written by GoTrue
-- after a successful MFA challenge and is not settable by the client. A
-- missing claim, an absent JWT (service_role, direct SQL, cron) or a malformed
-- value all resolve to NOT-aal2, so this fails CLOSED.
-- ---------------------------------------------------------------------------
create or replace function public.current_assurance_level()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(nullif(auth.jwt() ->> 'aal', ''), 'aal1');
$$;

comment on function public.current_assurance_level() is
  'Assurance level from the verified JWT (aal1/aal2). Missing or absent claim => aal1. Never trust a client-supplied value for this.';

-- ---------------------------------------------------------------------------
-- 2. The authoritative admin predicate: platform admin AND aal2.
--
-- Defined but not yet wired into is_super_admin() -- see the header.
-- ---------------------------------------------------------------------------
create or replace function public.has_admin_aal2()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid()
  )
  and public.current_assurance_level() = 'aal2';
$$;

comment on function public.has_admin_aal2() is
  'True only when the caller is a platform admin AND the session satisfied MFA (aal2). Intended to become the authoritative privileged-admin predicate once every platform admin has enrolled a factor.';

create or replace function public.assert_admin_aal2()
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.has_admin_aal2() then
    -- Deliberately identical to the 'forbidden' every admin_* function raises:
    -- the caller must not be able to tell "not an admin" from "admin who has
    -- not completed MFA". Distinguishing them would confirm to an attacker
    -- holding stolen credentials that the account IS a platform admin.
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

comment on function public.assert_admin_aal2() is
  'Raises forbidden (42501) unless the caller is a platform admin at aal2. Error is intentionally indistinguishable from the plain not-an-admin case.';

-- ---------------------------------------------------------------------------
-- 3. Readiness, so the owner does not have to guess when it is safe.
--
-- Returns one row per platform admin that cannot currently reach aal2.
-- An empty result means the tightening in the SOP can be applied without
-- locking anyone out.
-- ---------------------------------------------------------------------------
create or replace function public.admin_aal2_readiness()
returns table (user_id uuid, email text, has_verified_factor boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select pa.user_id,
         u.email::text,
         exists (
           select 1 from auth.mfa_factors f
           where f.user_id = pa.user_id and f.status = 'verified'
         ) as has_verified_factor
  from public.platform_admins pa
  join auth.users u on u.id = pa.user_id
  order by 3, 2
$$;

comment on function public.admin_aal2_readiness() is
  'Per-platform-admin MFA enrolment state. Every row must show has_verified_factor = true before is_super_admin() is tightened to require aal2, or those admins lose all admin data access with no way to recover (see MIGRATION_RELEASE_SOP.md section 9).';

-- Privileged introspection: only an existing admin, or the server, may ask.
revoke all on function public.admin_aal2_readiness() from public;
revoke all on function public.admin_aal2_readiness() from anon;
grant execute on function public.admin_aal2_readiness() to authenticated, service_role;

revoke all on function public.current_assurance_level() from public;
revoke all on function public.current_assurance_level() from anon;
grant execute on function public.current_assurance_level() to authenticated, service_role;

revoke all on function public.has_admin_aal2() from public;
revoke all on function public.has_admin_aal2() from anon;
grant execute on function public.has_admin_aal2() to authenticated, service_role;

revoke all on function public.assert_admin_aal2() from public;
revoke all on function public.assert_admin_aal2() from anon;
grant execute on function public.assert_admin_aal2() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. State the residual plainly in the database itself, so nobody reading
--    is_super_admin() concludes MFA is enforced at the data boundary.
-- ---------------------------------------------------------------------------
comment on function public.is_super_admin() is
  'Platform-admin authority: platform_admins membership ONLY. Does NOT require aal2, so a stolen admin credential still reaches the admin data surface via PostgREST at aal1. has_admin_aal2() is the intended replacement predicate; the switch is blocked on MFA enrolment (admin_aal2_readiness()) and is documented in MIGRATION_RELEASE_SOP.md section 9.';
