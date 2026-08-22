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
  max_attempts integer;
  window_seconds integer;
  v_bucket_key text;
  v_count integer;
begin
  -- Limits live inside the function, never in the arguments: a caller must
  -- not be able to request a more generous limit than this allowlist grants.
  case scope
    when 'login_ip' then
      max_attempts := 20;
      window_seconds := 900;
    when 'login_email' then
      max_attempts := 8;
      window_seconds := 900;
    when 'password_reset_ip' then
      max_attempts := 10;
      window_seconds := 3600;
    when 'password_reset_email' then
      max_attempts := 5;
      window_seconds := 3600;
    when 'signup_ip' then
      max_attempts := 10;
      window_seconds := 3600;
    when 'magic_link_email' then
      max_attempts := 5;
      window_seconds := 3600;
    else
      -- Fail closed on an unknown scope rather than silently allowing.
      raise exception 'consume_rate_limit: unknown scope %', scope;
  end case;

  -- Hash the identifier so raw emails/IPs never land in the table.
  v_bucket_key := scope || ':' || encode(digest(lower(identifier), 'sha256'), 'hex');

  -- Atomic increment with window roll-over in a single statement: no
  -- read-then-write race under concurrent login attempts.
  insert into public.auth_rate_limits (bucket_key, window_start, attempt_count)
  values (v_bucket_key, now(), 1)
  on conflict (bucket_key) do update
    set window_start = case
          when auth_rate_limits.window_start < now() - make_interval(secs => window_seconds)
            then now()
          else auth_rate_limits.window_start
        end,
        attempt_count = case
          when auth_rate_limits.window_start < now() - make_interval(secs => window_seconds)
            then 1
          else auth_rate_limits.attempt_count + 1
        end
  returning attempt_count into v_count;

  return v_count <= max_attempts;
end;
$$;

comment on function public.consume_rate_limit(text, text) is
  'SECURITY DEFINER rate limiter for auth flows. Scope allowlist and limits are hard-coded inside the function; unknown scopes raise. Identifiers are hashed before storage.';

-- login is unauthenticated, so anon genuinely needs to call this.
grant execute on function public.consume_rate_limit(text, text) to anon, authenticated;
