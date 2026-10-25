-- ===========================================================================
-- Inbound rate-limit scope for the Stage 0 webhook routes.
--
-- WHY A MIGRATION AND NOT CONFIGURATION
-- 0044 put the scope allowlist and its limits INSIDE
-- public.consume_rate_limit() on purpose: "a caller must not be able to
-- request a more generous limit than this allowlist grants". Adding a scope is
-- therefore a schema change, by design.
--
-- WHY THE WHOLE FUNCTION IS RESTATED
-- Postgres has no way to patch a function body; `create or replace` takes the
-- complete definition. The body below is 0044's, reproduced exactly, with one
-- new `when` branch added before the fail-closed `else`. It was extracted from
-- that file programmatically rather than retyped, so the two cannot differ by
-- transcription. If 0044's reasoning is ever revised, this file must be
-- revised with it -- the comments inside the body are 0044's own and are
-- preserved verbatim for that reason.
--
-- WHY THE REVOKES ARE REPEATED
-- `create or replace` retains an existing function's privileges, so strictly
-- they are already in place. They are restated because 0044's comment is
-- emphatic that all three are independently required and that revoking only
-- `from public` changes nothing, and because a future reader comparing the two
-- files should not have to infer that the protection survived.
-- ===========================================================================

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
    when 'inbound_ip' then
      -- Applies ONLY to webhook requests that FAILED signature verification.
      -- A valid HMAC proves the caller holds the Meta app secret, so the
      -- verified path is never limited: doing so would throttle Meta's own
      -- egress addresses, which carry every tenant's real traffic. What lands
      -- here is someone hammering a public URL with junk, and 60 attempts per
      -- 15 minutes is ample for that to be noticed and useless for flooding
      -- inbound_webhook_events.
      v_max_attempts := 60;
      v_window_seconds := 900;
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
  'SECURITY DEFINER rate limiter for auth flows and unsigned inbound webhook requests. Scope allowlist and limits are hard-coded inside the function; unknown scopes raise. Identifiers are hashed before storage.';

revoke all on function public.consume_rate_limit(text, text) from public;
revoke all on function public.consume_rate_limit(text, text) from anon;
revoke all on function public.consume_rate_limit(text, text) from authenticated;
