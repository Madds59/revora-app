-- Grant the PostgREST/API roles access to public objects.
-- Row-level security (enabled in 0002) still governs which ROWS each role can
-- see or change; these GRANTs only open the TABLES at the privilege layer.
-- Hosted Supabase applies equivalent grants automatically; local Supabase and
-- any self-hosted Postgres need them explicit, so they live in a migration.

grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables in schema public
  to anon, authenticated, service_role;
grant all privileges on all sequences in schema public
  to anon, authenticated, service_role;
grant execute on all functions in schema public
  to anon, authenticated, service_role;

-- Future objects created in public inherit the same grants.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
