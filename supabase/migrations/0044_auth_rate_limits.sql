-- ===========================================================================
-- Auth rate-limit store. Ported from security/appsec-10-auth-hardening
-- (APPSEC-10 Task 4) as 0044, folding in that branch's 0032 index.
--
-- WHY RENUMBERED
-- On that branch this was 0031 and the index was 0032. Both sort BELOW the
-- 0034-0043 already applied to production, so they could never have been
-- applied there in order -- which is exactly the trap `pnpm audit:migrations`
-- now catches: `ls supabase/migrations` on main shows 0031-0033 free, and they
-- are not. Production has never applied them (its set is 0001-0030, 0034-0038).
--
-- WHY IDEMPOTENT, when the original was not
-- At least one local development database HAS applied the old 0031/0032 by
-- those version numbers (its schema_migrations ends at 0033, with no 0034+).
-- Re-running the original `create table` / `create index` there would abort.
-- Every statement below is therefore safe to re-run, so this file converges
-- whether the objects already exist or not. The branch's 0032 is folded in for
-- the same reason: its whole purpose was to avoid editing an already-applied
-- 0031, and a brand-new file carries no such history.
--
-- WHAT IS UNCHANGED, and must stay unchanged
-- The scope allowlist, the hashed bucket key, the single-statement atomic
-- increment, the opportunistic reaper, and above all the three separate
-- revokes on the function. Those were arrived at by review on the source
-- branch and the reasoning is preserved verbatim below.
-- ===========================================================================

create table if not exists public.auth_rate_limits (
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

-- ---------------------------------------------------------------------------
-- Index on window_start (was 0032 on the source branch).
--
-- consume_rate_limit()'s opportunistic reaper deletes buckets whose window
-- closed over a day ago on ~1% of calls, inline on the auth path -- every
-- sign-in, signup, magic-link and password-reset request goes through this
-- RPC. Without this index that delete is a sequential scan of the whole table,
-- and the table's row count is not bounded by request validation: each
-- distinct (scope, identifier) pair gets a row and an attacker chooses
-- identifiers. Unbounded bucket cardinality remains a documented residual;
-- this index just stops it also costing an unindexed scan on the path every
-- user depends on to sign in.
-- ---------------------------------------------------------------------------
create index if not exists auth_rate_limits_window_start_idx
  on public.auth_rate_limits (window_start);

-- APPSEC-21 (0042) revoked TRUNCATE/TRIGGER/REFERENCES from the API roles and
-- narrowed the schema default, so this table does not inherit them. The
-- `revoke all` above is independent of that and stays: this table must be
-- reachable only through the SECURITY DEFINER RPC.
