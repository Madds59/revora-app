-- ============================================================================
-- Supabase compatibility shim for a bare PostgreSQL container.
--
-- WHY THIS EXISTS
-- The RLS policies in 0002 and the SECURITY DEFINER functions throughout the
-- migration set are the real enforcement boundary for tenant isolation, and
-- Rule F of the Phase 1 remediation brief forbids calling a security property
-- "fixed" on the strength of a mock. Exercising them needs a real PostgreSQL
-- with the handful of Supabase-managed objects the migrations reference:
--
--   auth.uid()      -- 65 call sites, the backbone of every policy
--   auth.jwt()      -- onboarding/invitation claim flows
--   auth.users      -- FK target for actor columns (id, email, created_at,
--                      raw_user_meta_data)
--   storage.*       -- buckets/objects, for supabase/policies/storage-policies.sql
--   pgcrypto        -- gen_random_uuid / digest
--
-- FIDELITY
-- RLS is enforced by PostgreSQL itself. PostgREST's only contribution to the
-- security decision is setting `role` and `request.jwt.claims` on the
-- connection, which is exactly what these functions read and what the test
-- harnesses set with `set local`. A policy that rejects a row here rejects it
-- in production for the same reason. This shim therefore proves policy
-- behaviour; it does NOT model PostgREST's HTTP surface, Auth's token issuance,
-- or Storage's object lifecycle.
--
-- This runs as superuser BEFORE any migration. Never against a real project.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- API roles. Hosted Supabase ships these; 0003_api_grants.sql grants to them
-- by name, so they must exist before it runs.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin login superuser;
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;

-- ---------------------------------------------------------------------------
-- auth schema
-- ---------------------------------------------------------------------------
create schema if not exists auth authorization postgres;

-- Column set mirrors hosted Supabase's auth.users. The migrations only read
-- id, email, created_at and raw_user_meta_data, but the project's existing
-- harnesses (dvi_security_tests.sql, legal_compliance_tests.sql) seed users
-- with the full shape -- instance_id, aud, role, encrypted_password -- so a
-- narrower table makes those suites fail for a reason that has nothing to do
-- with the security property under test.
create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key default gen_random_uuid(),
  aud varchar(255),
  role varchar(255),
  email varchar(255) unique,
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token varchar(255),
  confirmation_sent_at timestamptz,
  recovery_token varchar(255),
  recovery_sent_at timestamptz,
  email_change_token_new varchar(255),
  email_change varchar(255),
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  is_super_admin boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  phone text unique,
  phone_confirmed_at timestamptz,
  phone_change text,
  phone_change_token varchar(255),
  phone_change_sent_at timestamptz,
  confirmed_at timestamptz,
  email_change_token_current varchar(255),
  email_change_confirm_status smallint,
  banned_until timestamptz,
  reauthentication_token varchar(255),
  reauthentication_sent_at timestamptz,
  is_sso_user boolean not null default false,
  deleted_at timestamptz,
  is_anonymous boolean not null default false
);

-- auth.uid(): the authenticated subject, read from the request claims GUC
-- exactly as hosted Supabase does. Returns NULL when unset or unparseable so
-- policies fail CLOSED rather than erroring.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
$$;

-- MFA factors. Shape mirrors hosted Supabase; factor_type and status are
-- enums there, modelled as text with a CHECK so the shim needs no extra types.
-- Required because the admin assurance helpers (0045) read this table to
-- report MFA enrolment readiness.
create table if not exists auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  friendly_name text,
  factor_type text not null default 'totp'
    check (factor_type in ('totp', 'phone', 'webauthn')),
  status text not null default 'unverified'
    check (status in ('unverified', 'verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  secret text,
  phone text,
  last_challenged_at timestamptz,
  web_authn_credential jsonb,
  web_authn_aaguid uuid,
  last_webauthn_challenge_data jsonb
);

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;
grant select on auth.mfa_factors to authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- storage schema (minimal: supabase/policies/storage-policies.sql targets it)
-- ---------------------------------------------------------------------------
create schema if not exists storage authorization postgres;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_class where relname = 'objects'
      and relnamespace = 'storage'::regnamespace and relrowsecurity
  ) then
    alter table storage.objects enable row level security;
  end if;
end
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to authenticated, service_role;

-- Supabase exposes this helper to storage policies.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$ select string_to_array(name, '/'); $$;
