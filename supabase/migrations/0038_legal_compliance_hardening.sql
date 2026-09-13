-- Legal & Compliance Foundation V1 (see docs/superpowers/specs/2026-09-12-legal-compliance-v1-design.md).
--
-- Three independent changes, all reversible, none touching data:
--
-- 1. anon may no longer EXECUTE any SECURITY DEFINER function in schema public,
--    except the two inspection share resolvers that are deliberately the public
--    doorway (0037). The Supabase security advisor flagged 58 such functions.
--    Every one of them already refuses unauthenticated callers inside its body
--    (is_super_admin() / membership checks), so this is defence in depth: the
--    privilege layer now agrees with the application layer, and a future function
--    that forgets its internal guard is not reachable from the anon key.
--
--    WHY A LOOP: Supabase ships DEFAULT PRIVILEGES that grant EXECUTE on every new
--    public function to the anon ROLE directly (not to PUBLIC), so a blanket
--    `revoke ... from public` does nothing. The loop revokes from anon per function,
--    then the default privilege is changed so the problem does not recur.
--
-- 2. set_updated_at() gets an empty search_path (advisor: function_search_path_mutable).
--    Its body references only `now()` and NEW, both resolved via pg_catalog.
--
-- 3. Portal customers may manage their OWN template-wide notification_preferences
--    rows (self-service email/SMS opt-out). The dispatcher already honours these rows.
--
-- Apply through the DB migration SOP (docs/DB_MIGRATION_RELEASE_SOP.md) — this file
-- is not applied automatically by the app.

-- ---------------------------------------------------------------------------
-- 1. anon EXECUTE on SECURITY DEFINER functions
-- ---------------------------------------------------------------------------

do $$
declare
  fn record;
  had_authenticated boolean;
  had_service_role boolean;
  -- Functions that intentionally remain callable without a session. Each must be
  -- justified in the migration that created it. Keep this list short.
  anon_allowlist text[] := array[
    'resolve_inspection_share(bytea)',
    'resolve_inspection_share_items(bytea)'
  ];
begin
  for fn in
    select p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args,
           -- name(types) without parameter names, e.g. resolve_inspection_share(bytea).
           -- regprocedure prefixes the schema when public is not on search_path,
           -- so strip it: the allowlist must not depend on session settings.
           regexp_replace(p.oid::regprocedure::text, '^public\.', '') as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prokind = 'f'
  loop
    if fn.signature = any (anon_allowlist) then
      continue;
    end if;
    if not has_function_privilege('anon', fn.oid, 'EXECUTE') then
      continue;
    end if;

    -- anon can reach the function either through a direct grant or through the
    -- implicit EXECUTE-to-PUBLIC every function is created with. Both must go.
    -- Snapshot what authenticated / service_role could do BEFORE touching PUBLIC,
    -- then restore exactly that, so a function that was deliberately restricted
    -- to service_role (e.g. claim_queued_notification_events, 0030) is not widened.
    had_authenticated := has_function_privilege('authenticated', fn.oid, 'EXECUTE');
    had_service_role := has_function_privilege('service_role', fn.oid, 'EXECUTE');

    execute format('revoke execute on function public.%I(%s) from public, anon', fn.proname, fn.args);
    if had_authenticated then
      execute format('grant execute on function public.%I(%s) to authenticated', fn.proname, fn.args);
    end if;
    if had_service_role then
      execute format('grant execute on function public.%I(%s) to service_role', fn.proname, fn.args);
    end if;
  end loop;
end;
$$;

-- Stop the default privilege from re-granting anon on functions created by
-- future migrations. authenticated and service_role keep their defaults; a
-- migration that needs anon access must grant it explicitly (as 0037 does).
alter default privileges in schema public revoke execute on functions from anon;

-- Assert the invariant so the SOP reviewer sees a hard failure, not a warning.
do $$
declare
  offender text;
begin
  select string_agg(regexp_replace(p.oid::regprocedure::text, '^public\.', ''), ', ')
    into offender
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.prokind = 'f'
    and regexp_replace(p.oid::regprocedure::text, '^public\.', '') not in (
      'resolve_inspection_share(bytea)',
      'resolve_inspection_share_items(bytea)'
    )
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if offender is not null then
    raise exception 'anon can still execute SECURITY DEFINER function(s): %', offender;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. set_updated_at search_path
-- ---------------------------------------------------------------------------

alter function public.set_updated_at() set search_path = '';

-- ---------------------------------------------------------------------------
-- 3. Portal customers manage their own notification preferences
-- ---------------------------------------------------------------------------

-- Scope: rows keyed to one of the caller's linked customer records
-- (customers.app_user_id = auth.uid(), checked by is_customer_for_business),
-- never staff rows (user_id must be null). Read access already exists via
-- notification_preferences_customer_read_own (0030).
drop policy if exists "notification_preferences_customer_manage_own"
  on public.notification_preferences;

create policy "notification_preferences_customer_manage_own"
  on public.notification_preferences
  for all
  using (
    customer_id is not null
    and user_id is null
    and public.is_customer_for_business(business_id, customer_id)
  )
  with check (
    customer_id is not null
    and user_id is null
    and public.is_customer_for_business(business_id, customer_id)
  );

comment on policy "notification_preferences_customer_manage_own"
  on public.notification_preferences is
  'Legal-compliance V1: portal customers can switch email/SMS on or off for their own linked account. '
  'Business-wide gates in business_notification_settings still apply on top.';
