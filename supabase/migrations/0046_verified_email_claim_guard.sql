-- ===========================================================================
-- Require a verified email before any identity-claiming flow (APPSEC-22).
--
-- THE GAP
-- Two SECURITY DEFINER functions grant standing authority purely on an email
-- string taken from the caller's JWT:
--
--   claim_customer_records()      links every unclaimed customers row whose
--                                 email matches -> full portal access to that
--                                 person's vehicles, quotations, invoices and
--                                 complaints.
--   claim_business_invitations()  accepts every pending invitation whose email
--                                 matches -> business_members row, i.e. STAFF
--                                 access inside that tenant, at the invited
--                                 role.
--
-- Neither checked that the email had been verified. The only thing standing
-- between "I typed victim@example.com at signup" and that authority was
-- whether the Supabase project happens to have email confirmation switched on
-- -- a dashboard setting, outside this repository, that nothing here asserts.
--
-- It is not switched on in the configuration this repo DOES control:
-- supabase/config.toml has `enable_confirmations = false` under [auth.email],
-- so on a local or CI stack a signup receives a session immediately with an
-- unverified address. The invitation path is the sharper of the two: it is a
-- route into another tenant's staff surface, not just one customer's records.
--
-- THE FIX
-- A guard read from auth.users.email_confirmed_at -- the server-side fact
-- GoTrue writes on confirmation -- rather than from a JWT claim. Both claim
-- functions now grant nothing to an unverified identity, so the invariant
-- holds whatever the project's confirmation setting is, and keeps holding if
-- someone turns it off later.
--
-- WHY IT RETURNS 0 INSTEAD OF RAISING
-- Both functions already `return 0` when the JWT carries no email, and the
-- portal and onboarding pages call them on load and render an empty state from
-- the result. Returning 0 keeps that contract: an unverified user sees no
-- linked accounts and no membership, which is exactly the desired outcome,
-- without turning a page load into an error. Nothing is granted; nothing
-- breaks.
--
-- FORWARD-ONLY and idempotent. Function bodies are otherwise unchanged.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The guard. Reads the authoritative server-side column, not a claim.
--
-- auth.jwt() -> 'email_verified' exists but is derived and travels in the
-- token; email_confirmed_at is the row GoTrue actually writes. A NULL uid, a
-- missing user row or an unconfirmed address all resolve to false, so this
-- fails CLOSED.
-- ---------------------------------------------------------------------------
create or replace function public.current_email_is_verified()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
  );
$$;

comment on function public.current_email_is_verified() is
  'True only when the signed-in user has a confirmed email, read from auth.users.email_confirmed_at. Backstop for the identity-claiming flows so they do not depend on the project''s email-confirmation setting (APPSEC-22).';

revoke all on function public.current_email_is_verified() from public;
revoke all on function public.current_email_is_verified() from anon;
grant execute on function public.current_email_is_verified() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Customer claim: unchanged except for the guard.
-- ---------------------------------------------------------------------------
create or replace function public.claim_customer_records()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  user_name text := nullif(btrim(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', '')), '');
  linked integer := 0;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- The profile row is created regardless: it holds no authority, and the
  -- onboarding UI depends on it existing. Only the LINKING is gated.
  insert into public.profiles (id, full_name)
  values (uid, user_name)
  on conflict (id) do nothing;

  if user_email is null then
    return 0;
  end if;

  -- APPSEC-22: an unverified address must not claim another person's records.
  if not public.current_email_is_verified() then
    return 0;
  end if;

  update public.customers
    set app_user_id = uid
    where app_user_id is null
      and deleted_at is null
      and lower(customers.email) = user_email;
  get diagnostics linked = row_count;

  return linked;
end;
$$;

comment on function public.claim_customer_records() is
  'Links unclaimed customer records to the signed-in user by email. Requires a verified email (APPSEC-22): an unverified identity links nothing and receives no portal access.';

-- ---------------------------------------------------------------------------
-- Invitation claim: the same guard, on the higher-value path.
-- ---------------------------------------------------------------------------
create or replace function public.claim_business_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  user_name text := nullif(btrim(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', '')), '');
  accepted integer := 0;
  inv record;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if user_email is null then
    return 0;
  end if;

  insert into public.profiles (id, full_name)
  values (uid, user_name)
  on conflict (id) do nothing;

  -- APPSEC-22: accepting an invitation grants STAFF access inside a tenant.
  -- An unverified address must not reach it. Checked before the loop, so no
  -- invitation is consumed or marked accepted on the way out.
  if not public.current_email_is_verified() then
    return 0;
  end if;

  for inv in
    select * from public.business_invitations
    where status = 'pending' and lower(email) = user_email
  loop
    insert into public.business_members (business_id, user_id, role)
    values (inv.business_id, uid, inv.role)
    on conflict (business_id, user_id) do nothing;

    update public.business_invitations
      set status = 'accepted', accepted_by = uid, accepted_at = now()
      where id = inv.id;

    accepted := accepted + 1;
  end loop;

  return accepted;
end;
$$;

comment on function public.claim_business_invitations() is
  'Accepts pending business invitations matching the signed-in user''s email. Requires a verified email (APPSEC-22): accepting grants staff access inside a tenant, so an unverified identity accepts nothing and no invitation is consumed.';
