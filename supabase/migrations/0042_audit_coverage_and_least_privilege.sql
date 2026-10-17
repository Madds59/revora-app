-- ===========================================================================
-- Audit coverage for the Phase 1 trusted record, and least privilege on the
-- API roles (APPSEC-21).
--
-- PART 1 -- TRUNCATE, TRIGGER and REFERENCES should never have been granted
--
-- 0003_api_grants.sql does:
--
--     grant all privileges on all tables in schema public
--       to anon, authenticated, service_role;
--
-- GRANT ALL on a table includes TRUNCATE, TRIGGER and REFERENCES, and
-- **row-level security does not apply to TRUNCATE** -- it is a table-level
-- privilege, checked before any policy is consulted. The result, measured on a
-- real database at schema 0041:
--
--     set local role anon;                     -- unauthenticated
--     truncate table public.audit_events;      -- SUCCEEDS
--
-- and the same for all 63 tables in `public`. A caller that RLS shows zero rows
-- to could still erase every tenant's data, and the audit trail with it.
--
-- HONEST SEVERITY. PostgREST has no TRUNCATE verb, `anon` and `authenticated`
-- are NOLOGIN so they cannot open a direct connection, and neither holds CREATE
-- on schema `public`, so none of this is reachable through the public API
-- today. It is a latent least-privilege failure that would turn any future
-- arbitrary-SQL primitive -- an injectable SECURITY INVOKER function, a new
-- admin path that interpolates user input -- from a scoped bug into total,
-- cross-tenant data destruction. It is also free to remove: nothing in the
-- product needs these three privileges.
--
-- PART 2 -- audit coverage stopped at the 0001/0002 core
--
-- audit_row_change() was attached to 14 tables. Everything added since was
-- left out: the whole 0034 financial layer (invoices, invoice_items,
-- invoice_payments, invoice_credit_notes, appointments), the whole 0037
-- inspection layer, and -- despite being core trusted-record entities --
-- `vehicles`, `complaint_evidence`, `approval_events` and `job_tasks`.
-- So an invoice could be issued, paid, credited and voided without a single
-- audit row.
--
-- PART 3 -- audit payloads were unfiltered
--
-- audit_row_change() writes to_jsonb(new) wholesale. Extending it to the
-- inspection tables would have copied `share_token_hash` into audit_events,
-- and to any future table would copy whatever that table holds. The payload is
-- now filtered through a deny-list of credential-like column names.
--
-- This does NOT claim tamper-PROOF. audit_events is append-only for the API
-- roles (no INSERT/UPDATE/DELETE grant, no policy for them, and now no
-- TRUNCATE), which makes tampering require database-owner access. That is
-- tamper-RESISTANT and attributable; it is not cryptographic immutability, and
-- it should not be described as such.
--
-- FORWARD-ONLY. Revokes privileges and adds triggers; drops no column and
-- deletes no row.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Least privilege on the API roles.
--
-- SELECT/INSERT/UPDATE/DELETE stay: those are the privileges RLS governs, and
-- the policies are the access-control layer. TRUNCATE is removed because RLS
-- cannot govern it. TRIGGER and REFERENCES are removed because PostgREST needs
-- neither, and both are escalation primitives if CREATE on the schema is ever
-- widened.
--
-- service_role keeps its privileges: it is the trusted server-side key and
-- already bypasses RLS by design.
-- ---------------------------------------------------------------------------
revoke truncate, trigger, references on all tables in schema public
  from anon, authenticated;

-- 0003 also set ALTER DEFAULT PRIVILEGES to grant ALL on future tables, which
-- would hand TRUNCATE straight back to the next table anyone creates. Narrow
-- the default rather than relying on every future migration to remember.
alter default privileges in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;

-- audit_events is evidence: the API roles get SELECT only (the
-- audit_events_members_read policy then scopes that to their own tenant).
revoke insert, update, delete on public.audit_events from anon, authenticated;

comment on table public.audit_events is
  'Append-only audit trail. Written by audit_row_change() (SECURITY DEFINER); the API roles hold SELECT only, scoped to their own tenant by audit_events_members_read. Tamper-resistant and attributable, not cryptographically immutable (APPSEC-21).';

-- ---------------------------------------------------------------------------
-- 2. Redact credential-like columns from audit payloads.
--
-- Matches on column NAME, so a table added later inherits the filter without
-- anyone having to remember it. Deliberately narrow: this strips credentials
-- and bearer-like values, NOT ordinary business PII such as a customer's name
-- or phone, because an audit row that cannot show what a field changed to is
-- not an audit row. Keeping identifying fields is the point of the trail; the
-- access control on it is audit_events_members_read.
-- ---------------------------------------------------------------------------
create or replace function public.audit_redact(payload jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when payload is null then null
    else (
      select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
      from jsonb_each(payload)
      where key !~* '(token|secret|password|encrypted|api[_-]?key|signature_hash)'
    )
  end;
$$;

comment on function public.audit_redact(jsonb) is
  'Strips credential-like keys (token/secret/password/encrypted/api_key) from an audit payload before it is stored. Business PII is intentionally retained: an audit row must show what changed (APPSEC-21).';

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_business_id uuid;
  row_record_id uuid;
begin
  row_business_id = coalesce((to_jsonb(new)->>'business_id')::uuid, (to_jsonb(old)->>'business_id')::uuid);
  row_record_id = coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid);

  insert into public.audit_events (
    business_id,
    actor_id,
    table_name,
    record_id,
    action,
    old_data,
    new_data
  )
  values (
    row_business_id,
    auth.uid(),
    tg_table_name,
    row_record_id,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then public.audit_redact(to_jsonb(old)) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then public.audit_redact(to_jsonb(new)) else null end
  );

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Extend coverage to the rest of the Phase 1 trusted record.
--
-- Driven from a list so the set is reviewable, and idempotent so re-running is
-- safe. audit_events itself is excluded: auditing the audit table recurses.
--
-- A table is included when a change to it is a material Phase 1 lifecycle
-- event somebody may later need to reconstruct or attribute.
-- ---------------------------------------------------------------------------
do $audit$
declare
  t text;
  targets text[] := array[
    -- finance (0034) -- previously entirely unaudited
    'invoices', 'invoice_items', 'invoice_payments', 'invoice_credit_notes',
    'appointments',
    -- trusted-record entities that were missed in the original set
    'vehicles', 'complaint_evidence', 'approval_events', 'job_tasks',
    -- inspection / diagnosis (0037)
    'vehicle_inspections', 'inspection_items', 'inspection_item_media',
    -- catalogue changes move money, so they are material too
    'products'
  ];
begin
  foreach t in array targets loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.audit_row_change()',
      t || '_audit', t
    );
  end loop;
end
$audit$;

-- ---------------------------------------------------------------------------
-- 4. Record what is covered, so the gate can assert it rather than trust it.
-- ---------------------------------------------------------------------------
create or replace function public.audited_tables()
returns table (table_name text)
language sql
stable
set search_path = public
as $$
  select distinct c.relname::text
  from pg_trigger tg
  join pg_class c on c.oid = tg.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not tg.tgisinternal
    and tg.tgfoid = 'public.audit_row_change'::regproc
    and n.nspname = 'public'
$$;

comment on function public.audited_tables() is
  'Tables carrying the audit_row_change() trigger. Used by the audit-coverage gate (APPSEC-21).';
