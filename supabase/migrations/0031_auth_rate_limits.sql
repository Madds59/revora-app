-- Auth rate-limit store.
--
-- Postgres-backed counter: the app is serverless (per-instance memory counters
-- would be useless across invocations) and there is no Redis in this stack.
-- pgcrypto's digest() is already available via 0001_core_schema.sql
-- (`create extension if not exists "pgcrypto"`); no extension statement here.
--
-- Task 5 wires this into the auth Server Actions. This migration only builds
-- the store: table + SECURITY DEFINER RPC. No application code is touched.

create table public.auth_rate_limits (
  bucket_key text primary key,
  window_start timestamptz not null default now(),
  attempt_count integer not null default 0
);

alter table public.auth_rate_limits enable row level security;

-- Deliberately NO policies: this table is reachable only through the
-- SECURITY DEFINER RPC below, never directly by anon/authenticated. RLS with
-- zero policies denies all rows to non-privileged roles by default.
comment on table public.auth_rate_limits is
  'Rate-limit counters for auth flows. RLS is enabled with zero policies, deliberately: this table is reachable only through the SECURITY DEFINER function public.consume_rate_limit(), never selected/inserted/updated directly by anon or authenticated.';

-- 0003_api_grants.sql runs `alter default privileges in schema public grant
-- all on tables to anon, authenticated, service_role`, so this new table would
-- otherwise silently inherit a table-level grant. RLS-with-no-policies already
-- denies anon/authenticated reads, but this revoke makes that denial rest on
-- two independent mechanisms instead of one, so a future policy addition alone
-- can't accidentally open the table up.
revoke all on public.auth_rate_limits from anon, authenticated;

create or replace function public.consume_rate_limit(scope text, identifier text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_max_attempts integer;
  v_window_seconds integer;
  v_bucket_key text;
  v_count integer;
begin
  -- Limits live inside the function, never in the arguments: a caller must
  -- not be able to request a more generous limit than this allowlist grants.
  -- All four locals are prefixed with v_ (not just the two that happen to
  -- collide with a column today) because plpgsql's variable_conflict=error
  -- default raises on ANY identifier resolvable to both a local and a
  -- column in the same query — see the v_bucket_key rename below. Leaving
  -- v_max_attempts/v_window_seconds unprefixed would silently reintroduce
  -- that bug the day a max_attempts or window_seconds column is added.
  case scope
    when 'login_ip' then
      v_max_attempts := 20;
      v_window_seconds := 900;
    when 'login_email' then
      v_max_attempts := 8;
      v_window_seconds := 900;
    when 'password_reset_ip' then
      v_max_attempts := 10;
      v_window_seconds := 3600;
    when 'password_reset_email' then
      v_max_attempts := 5;
      v_window_seconds := 3600;
    when 'signup_ip' then
      v_max_attempts := 10;
      v_window_seconds := 3600;
    when 'magic_link_email' then
      v_max_attempts := 5;
      v_window_seconds := 3600;
    else
      -- Fail closed on an unknown scope rather than silently allowing.
      raise exception 'consume_rate_limit: unknown scope %', scope;
  end case;

  -- Hash the identifier so raw emails/IPs never land in the table. The
  -- local is named v_bucket_key (not bucket_key) because plpgsql raised
  -- "column reference \"bucket_key\" is ambiguous" when it matched both
  -- this variable and the table's bucket_key column inside the upsert below.
  v_bucket_key := scope || ':' || encode(digest(lower(identifier), 'sha256'), 'hex');

  -- Atomic increment with window roll-over in a single statement: no
  -- read-then-write race under concurrent login attempts.
  insert into public.auth_rate_limits (bucket_key, window_start, attempt_count)
  values (v_bucket_key, now(), 1)
  on conflict (bucket_key) do update
    set window_start = case
          when auth_rate_limits.window_start < now() - make_interval(secs => v_window_seconds)
            then now()
          else auth_rate_limits.window_start
        end,
        attempt_count = case
          when auth_rate_limits.window_start < now() - make_interval(secs => v_window_seconds)
            then 1
          else auth_rate_limits.attempt_count + 1
        end
  returning attempt_count into v_count;

  -- Opportunistic cleanup, not a scheduled reaper: this repo has no cron
  -- infrastructure, and every distinct (scope, identifier) pair otherwise
  -- creates a permanent row that nothing ever deletes. Piggyback a
  -- low-probability sweep on this already-frequent RPC instead: on ~1% of
  -- calls (random() < 0.01), delete buckets whose window closed over a day
  -- ago. 1 day is comfortably past every window_seconds value above (max
  -- 3600s), so this can never touch a bucket that's still relevant, and it
  -- runs after v_count is already captured, so it cannot affect the
  -- boolean this function returns.
  if random() < 0.01 then
    delete from public.auth_rate_limits
    where window_start < now() - interval '1 day';
  end if;

  return v_count <= v_max_attempts;
end;
$$;

comment on function public.consume_rate_limit(text, text) is
  'SECURITY DEFINER rate limiter for auth flows. Scope allowlist and limits are hard-coded inside the function; unknown scopes raise. Identifiers are hashed before storage.';

-- Postgres grants EXECUTE to PUBLIC on every newly created function (anon
-- and authenticated are members of PUBLIC), AND 0003_api_grants.sql's
-- `alter default privileges in schema public grant execute on functions to
-- anon, authenticated, service_role` grants EXECUTE to anon/authenticated
-- directly, independent of PUBLIC. Both are real, independent grants on
-- THIS function the moment it's created, so both must be revoked
-- explicitly — revoking only `from public` leaves anon/authenticated with
-- direct access and changes nothing (verified: an anon-key RPC call still
-- succeeded until all three revokes below were added). This mirrors
-- 0030_notifications_foundation.sql's claim_queued_notification_events,
-- which revokes from public/anon/authenticated separately for the same
-- reason.
--
-- Task 5 calls this via the service-role client
-- (apps/web/src/lib/supabase/admin.ts) from Next.js Server Actions, never
-- from the browser. Leaving anon/authenticated able to call this directly
-- would make it reachable as POST /rest/v1/rpc/consume_rate_limit with the
-- public anon key: an attacker who knows a victim's email could burn their
-- login_email/password_reset_email/magic_link_email bucket with a handful
-- of unauthenticated curl calls and lock them out, without ever attempting
-- a login. Do not "helpfully" restore anon/authenticated here.
revoke all on function public.consume_rate_limit(text, text) from public;
revoke all on function public.consume_rate_limit(text, text) from anon;
revoke all on function public.consume_rate_limit(text, text) from authenticated;
grant execute on function public.consume_rate_limit(text, text) to service_role;
