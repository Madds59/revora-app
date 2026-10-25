-- ===========================================================================
-- Stage 0: inbound capture. The entry point the app has never had.
--
-- WHY THIS EXISTS
-- Revora's first-class record is `customers`, created by hand by a staff
-- member. There is no object for "a stranger who just asked a question", and
-- no route that can receive one: the app has five API routes (cron scan,
-- notification dispatch, Stripe webhook, launch-ops templates, auth callback)
-- and none of them is inbound from a consumer. Twilio appears in the codebase
-- only as an OUTBOUND SMS provider in notifications/provider.js. A DM, a Meta
-- lead-form submission and a phone call are therefore all unrecorded today.
--
-- THE TENANT-RESOLUTION PROBLEM, which shapes everything below
-- Every other table in this schema hangs off a business_id that an
-- authenticated session already proves. An inbound webhook proves nothing: it
-- arrives unauthenticated, from Meta or a telephony provider, and claims to be
-- about some account. Resolving that claim to a tenant is the whole security
-- problem of Stage 0, and it is solved structurally here rather than in
-- application code:
--
--   * inbound_channel_routes carries a GLOBAL unique (channel,
--     external_account_id). Two tenants cannot both claim the same Instagram
--     account, WhatsApp number or DID. Tenant resolution is a single lookup
--     against a uniqueness constraint, not a judgement.
--   * inbound_webhook_events stores the raw signed payload BEFORE a tenant is
--     known, so it cannot be tenant-scoped. It therefore gets RLS with ZERO
--     policies plus explicit revokes -- the auth_rate_limits pattern from
--     0044 -- and is reachable only by the service role.
--   * Everything downstream (channel_identities, leads, lead_messages) is
--     tenant-scoped normally and is readable only by business members.
--
-- WHY COMPOSITE FOREIGN KEYS ONLY, never a single-column one alongside
-- 0039 established that a child row carrying its own business_id plus a
-- single-column FK to a parent is a cross-tenant write primitive: Postgres
-- validates foreign keys with RLS BYPASSED, so an FK aimed at another
-- tenant's row satisfies referential integrity happily. The fix is a
-- composite (parent_id, business_id) -> parent (id, business_id).
--
-- These tables declare ONLY the composite form. Adding both would leave two
-- foreign-key paths between the same pair of tables, which is what made 111
-- PostgREST relationship pairs ambiguous after 0039 and surfaced as PGRST201
-- rendered as a false empty state. One path per pair keeps every embed from
-- these tables resolvable without a constraint hint.
--
-- CUSTOMER PORTAL ACCESS IS DELIBERATELY ABSENT
-- A lead is a stranger's inquiry. It is business-internal until it has been
-- matched to a customer and converted, at which point the existing
-- customer/vehicle/appointment records carry the relationship and their own
-- portal policies apply. No policy below grants a portal user anything, and
-- that is the intended end state, not an omission to be "completed" later.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Channel vocabulary. A domain, not free text: a typo in a channel name
--    would silently create a second, unroutable channel.
-- ---------------------------------------------------------------------------
do $enum$
begin
  if not exists (select 1 from pg_type where typname = 'inbound_channel') then
    create type public.inbound_channel as enum (
      'instagram', 'facebook', 'whatsapp', 'tiktok',
      'meta_lead_ad', 'voice', 'sms', 'email', 'web_chat', 'web_form'
    );
  end if;
end
$enum$;

-- ---------------------------------------------------------------------------
-- 2. inbound_channel_routes -- the tenant-resolution table.
--
-- The global unique on (channel, external_account_id) IS the security
-- boundary. Inserting a route for an account you do not control would
-- redirect that business's inbound leads into your tenant, so writes are
-- platform-admin only; a business owner may read their own routes but never
-- create one. This is the one table here whose write path is deliberately
-- NOT available to the tenant.
-- ---------------------------------------------------------------------------
create table if not exists public.inbound_channel_routes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid,
  channel public.inbound_channel not null,
  -- Meta page id / IG account id / WABA phone number id / DID in E.164.
  external_account_id text not null,
  display_label text,
  is_active boolean not null default true,
  -- Per-route hub verification token, hashed. Never the raw token: this table
  -- is readable by every member of the business.
  verify_token_hash bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inbound_channel_routes_account_unique
    unique (channel, external_account_id),
  constraint inbound_channel_routes_branch_fk
    foreign key (branch_id, business_id)
    references public.branches (id, business_id) on delete set null
);

create index if not exists inbound_channel_routes_business_id_idx
  on public.inbound_channel_routes (business_id);

comment on table public.inbound_channel_routes is
  'Maps an external channel account (Meta page, IG account, WABA number, DID) to exactly one tenant. The global unique on (channel, external_account_id) is the tenant-resolution guarantee: inbound webhooks are resolved by lookup, never by a claim in the payload. Writes are platform-admin only, because creating a route for an account you do not control would divert another business''s leads.';

-- ---------------------------------------------------------------------------
-- 3. inbound_webhook_events -- raw, signed, pre-tenant.
--
-- Written before the tenant is known, so it cannot carry a meaningful
-- business_id at insert time and cannot be protected by a tenant predicate.
-- RLS is enabled with ZERO policies and the grants from 0003 are revoked, so
-- anon and authenticated are denied by two independent mechanisms. Only the
-- service role, from the inbound route handlers, ever touches it.
--
-- external_event_id carries the provider's own id and is uniquely indexed per
-- channel: webhook delivery is at-least-once everywhere, and replay must be a
-- no-op rather than a duplicate lead. Same reasoning as 0021's unique indexes
-- on the Stripe line-item ids.
-- ---------------------------------------------------------------------------
create table if not exists public.inbound_webhook_events (
  id uuid primary key default gen_random_uuid(),
  channel public.inbound_channel not null,
  external_event_id text,
  -- Resolved after the fact, for forensics. NOT a security predicate.
  resolved_business_id uuid references public.businesses(id) on delete set null,
  route_id uuid references public.inbound_channel_routes(id) on delete set null,
  signature_verified boolean not null,
  payload jsonb not null,
  status text not null default 'received',
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint inbound_webhook_events_status_check
    check (status in ('received', 'processed', 'rejected',
                      'unresolved_tenant', 'bad_signature', 'duplicate'))
);

create unique index if not exists inbound_webhook_events_dedupe_idx
  on public.inbound_webhook_events (channel, external_event_id)
  where external_event_id is not null;

create index if not exists inbound_webhook_events_received_at_idx
  on public.inbound_webhook_events (received_at desc);

alter table public.inbound_webhook_events enable row level security;

-- 0003_api_grants.sql runs `alter default privileges in schema public grant
-- all on tables to anon, authenticated, service_role`, so this table inherits
-- a table-level grant the moment it is created. RLS with zero policies already
-- denies anon/authenticated, but the revoke makes that denial rest on two
-- independent mechanisms, so adding a policy later cannot alone open it up.
revoke all on public.inbound_webhook_events from anon, authenticated;

comment on table public.inbound_webhook_events is
  'Raw inbound webhook deliveries, stored before tenant resolution. RLS is enabled with zero policies, deliberately: reachable only by the service role from the inbound route handlers. resolved_business_id is forensic metadata, never a security predicate.';

-- ---------------------------------------------------------------------------
-- 4. channel_identities -- one person on one channel.
--
-- The thing that stops every channel building its own shadow customer list.
-- customer_id is nullable: a stranger has an identity before they have a
-- customer record, and that is the normal case at Stage 0.
-- ---------------------------------------------------------------------------
create table if not exists public.channel_identities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  channel public.inbound_channel not null,
  -- Provider-scoped id: Meta PSID, IG-scoped id, phone in E.164, email.
  external_id text not null,
  -- Display handle, which the person can change; never an identity key.
  external_handle text,
  display_name text,
  locale text,
  customer_id uuid,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channel_identities_unique
    unique (business_id, channel, external_id),
  constraint channel_identities_customer_fk
    foreign key (customer_id, business_id)
    references public.customers (id, business_id) on delete set null
);

create index if not exists channel_identities_business_id_idx
  on public.channel_identities (business_id);
create index if not exists channel_identities_customer_id_idx
  on public.channel_identities (customer_id);

-- (id, business_id) unique, so leads can reference this table with a
-- composite FK -- exactly as 0039 added for every pre-existing tenant parent.
-- It must exist BEFORE the referencing table is created.
alter table public.channel_identities
  drop constraint if exists channel_identities_id_business_id_key;
alter table public.channel_identities
  add constraint channel_identities_id_business_id_key unique (id, business_id);

comment on table public.channel_identities is
  'One person on one channel, scoped to one tenant. The unique on (business_id, channel, external_id) is what lets a phone number, an Instagram handle and an email reconcile to a single customer instead of three shadow records. customer_id is null until matched.';

-- ---------------------------------------------------------------------------
-- 5. leads -- the inquiry itself.
--
-- Every reference to a tenant-owned parent is a composite FK, so a lead can
-- never point at another tenant's customer, vehicle, appointment or quote.
-- assigned_to targets profiles, which is not tenant-scoped, so it is a plain
-- single-column reference.
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid,
  channel public.inbound_channel not null,
  channel_identity_id uuid,

  -- Resolution, all nullable: a lead begins as an unidentified stranger.
  customer_id uuid,
  vehicle_id uuid,

  status text not null default 'new',
  -- Free text from the consumer, as received.
  subject text,
  -- AI-generated, reviewable, never authoritative.
  summary text,
  intent text,
  service_type text,
  urgency text not null default 'unknown',
  ai_confidence numeric(4, 3),
  safety_flagged boolean not null default false,

  -- Meta/ads attribution, so /analytics can finally report cost per booked
  -- job rather than cost per click.
  source_campaign_id text,
  source_ad_id text,
  source_form_id text,

  assigned_to uuid references public.profiles(id) on delete set null,

  -- Conversion endpoints. A lead is "converted" when one of these is set.
  appointment_id uuid,
  quotation_id uuid,

  -- Consent captured at capture time, not inferred later. The privacy
  -- documentation in docs/security treats marketing consent as explicit.
  marketing_consent boolean not null default false,
  consent_source text,

  first_response_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint leads_status_check
    check (status in ('new', 'triaging', 'qualified', 'booked',
                      'converted', 'lost', 'spam', 'duplicate')),
  constraint leads_urgency_check
    check (urgency in ('unknown', 'low', 'medium', 'high', 'critical')),
  constraint leads_ai_confidence_range
    check (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1)),

  constraint leads_branch_fk
    foreign key (branch_id, business_id)
    references public.branches (id, business_id) on delete set null,
  constraint leads_channel_identity_fk
    foreign key (channel_identity_id, business_id)
    references public.channel_identities (id, business_id) on delete set null,
  constraint leads_customer_fk
    foreign key (customer_id, business_id)
    references public.customers (id, business_id) on delete set null,
  constraint leads_vehicle_fk
    foreign key (vehicle_id, business_id)
    references public.vehicles (id, business_id) on delete set null,
  constraint leads_appointment_fk
    foreign key (appointment_id, business_id)
    references public.appointments (id, business_id) on delete set null,
  constraint leads_quotation_fk
    foreign key (quotation_id, business_id)
    references public.quotations (id, business_id) on delete set null
);

create index if not exists leads_business_id_status_idx
  on public.leads (business_id, status);
create index if not exists leads_created_at_idx
  on public.leads (created_at desc);
create index if not exists leads_channel_identity_id_idx
  on public.leads (channel_identity_id);
create index if not exists leads_assigned_to_idx
  on public.leads (assigned_to);

-- Same again: lead_messages references leads compositely, so the unique
-- must be in place before section 6 creates it.
alter table public.leads
  drop constraint if exists leads_id_business_id_key;
alter table public.leads
  add constraint leads_id_business_id_key unique (id, business_id);

comment on table public.leads is
  'An inbound inquiry from a consumer, before they are a customer. Every tenant-owned reference is a composite (parent_id, business_id) foreign key, so a lead cannot be attached to another tenant''s records on any write path. No customer-portal policy exists by design: a lead is business-internal until it converts.';

-- ai_tool_calls predates the tenant-parent sweep in 0039 and carries no
-- (id, business_id) unique, so add one before lead_messages references it
-- compositely. business_id is nullable there and a unique permits nulls, so
-- existing business-less rows (the portal health check path) are unaffected --
-- they simply cannot be cited by a lead message, which is correct.
alter table public.ai_tool_calls
  drop constraint if exists ai_tool_calls_id_business_id_key;
alter table public.ai_tool_calls
  add constraint ai_tool_calls_id_business_id_key unique (id, business_id);

-- ---------------------------------------------------------------------------
-- 6. lead_messages -- each turn of the conversation.
--
-- is_internal exists because AGENTS.md makes one rule explicit: internal
-- complaint messages must never reach the customer. The same class of mistake
-- is available here the moment a lead thread is ever surfaced outside the
-- business, so the column is present from the start rather than retrofitted.
--
-- external_message_id is uniquely indexed per tenant and channel so a replayed
-- webhook cannot double-post a turn.
-- ---------------------------------------------------------------------------
create table if not exists public.lead_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  lead_id uuid not null,
  direction text not null,
  author_type text not null,
  author_user_id uuid references public.profiles(id) on delete set null,
  body text,
  media_asset_id uuid,
  external_message_id text,
  -- Links a generated reply back to its model call in the existing ledger.
  -- Composite, not single-column: see the constraint below.
  ai_tool_call_id uuid,
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),

  constraint lead_messages_direction_check
    check (direction in ('inbound', 'outbound')),
  constraint lead_messages_author_type_check
    check (author_type in ('customer', 'staff', 'ai_agent', 'system')),
  -- An AI-authored turn must name the model call that produced it, so no
  -- generated message is unattributable after the fact.
  constraint lead_messages_ai_requires_tool_call
    check (author_type <> 'ai_agent' or ai_tool_call_id is not null),

  constraint lead_messages_lead_fk
    foreign key (lead_id, business_id)
    references public.leads (id, business_id) on delete cascade,
  constraint lead_messages_media_fk
    foreign key (media_asset_id, business_id)
    references public.media_assets (id, business_id) on delete set null,
  -- ai_tool_calls is tenant-owned, so this reference needs the same composite
  -- guarantee as the rest. `pnpm audit:tenant-fks` caught the single-column
  -- form here: without it, a lead message in tenant A could cite tenant B's
  -- model call and corrupt attribution across the boundary. The constraint
  -- also encodes the right semantics -- an AI reply on a lead is always
  -- business-scoped, so it may only cite a tool call carrying the same
  -- business_id (never one of the business-less portal calls).
  constraint lead_messages_ai_tool_call_fk
    foreign key (ai_tool_call_id, business_id)
    references public.ai_tool_calls (id, business_id) on delete set null
);

create unique index if not exists lead_messages_external_id_idx
  on public.lead_messages (business_id, external_message_id)
  where external_message_id is not null;

create index if not exists lead_messages_lead_id_created_idx
  on public.lead_messages (lead_id, created_at);

comment on table public.lead_messages is
  'One turn in a lead conversation. An ai_agent turn must cite its ai_tool_calls row, so every generated message stays attributable. is_internal is present from the start because AGENTS.md forbids internal messages reaching customers, and a lead thread is the next place that mistake becomes available.';

-- ---------------------------------------------------------------------------
-- 7. Row level security.
--
-- Business staff only. No anon policy, no portal policy. Platform admins read
-- for support, as elsewhere in this schema.
-- ---------------------------------------------------------------------------
alter table public.inbound_channel_routes enable row level security;
alter table public.channel_identities enable row level security;
alter table public.leads enable row level security;
alter table public.lead_messages enable row level security;

-- Routes: readable by members, writable by nobody in the tenant.
drop policy if exists "inbound_channel_routes_read" on public.inbound_channel_routes;
create policy "inbound_channel_routes_read" on public.inbound_channel_routes
  for select using (
    public.is_business_member(business_id) or public.is_platform_admin()
  );

drop policy if exists "inbound_channel_routes_admin_manage" on public.inbound_channel_routes;
create policy "inbound_channel_routes_admin_manage" on public.inbound_channel_routes
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Identities, leads and messages: full access for staff of the owning tenant.
drop policy if exists "channel_identities_manage" on public.channel_identities;
create policy "channel_identities_manage" on public.channel_identities
  for all using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists "channel_identities_admin_read" on public.channel_identities;
create policy "channel_identities_admin_read" on public.channel_identities
  for select using (public.is_platform_admin());

drop policy if exists "leads_manage" on public.leads;
create policy "leads_manage" on public.leads
  for all using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists "leads_admin_read" on public.leads;
create policy "leads_admin_read" on public.leads
  for select using (public.is_platform_admin());

-- Messages additionally require the parent lead to belong to the same tenant.
-- The composite FK already guarantees it structurally; stating it in the
-- policy too is the defence-in-depth pattern 0035 and 0039 settled on.
drop policy if exists "lead_messages_manage" on public.lead_messages;
create policy "lead_messages_manage" on public.lead_messages
  for all using (
    public.is_business_member(business_id)
    and exists (
      select 1 from public.leads l
      where l.id = lead_id and l.business_id = lead_messages.business_id
    )
  )
  with check (
    public.is_business_member(business_id)
    and exists (
      select 1 from public.leads l
      where l.id = lead_id and l.business_id = lead_messages.business_id
    )
  );

drop policy if exists "lead_messages_admin_read" on public.lead_messages;
create policy "lead_messages_admin_read" on public.lead_messages
  for select using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 8. updated_at triggers, matching every other table in the schema.
-- ---------------------------------------------------------------------------
drop trigger if exists set_updated_at on public.inbound_channel_routes;
create trigger set_updated_at before update on public.inbound_channel_routes
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.channel_identities;
create trigger set_updated_at before update on public.channel_identities
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.leads;
create trigger set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. Audit coverage. leads is a record businesses will dispute (who got the
--    lead, when, and who changed its status), so it carries the same
--    audit_row_change trigger as the rest of the trusted record. The 0042
--    audit-coverage gate reads public.audited_tables() and will now include
--    these.
-- ---------------------------------------------------------------------------
drop trigger if exists audit_leads on public.leads;
create trigger audit_leads
  after insert or update or delete on public.leads
  for each row execute function public.audit_row_change();

drop trigger if exists audit_inbound_channel_routes on public.inbound_channel_routes;
create trigger audit_inbound_channel_routes
  after insert or update or delete on public.inbound_channel_routes
  for each row execute function public.audit_row_change();
