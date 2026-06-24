-- F5 notifications foundation.
--
-- Post-apply verification:
--   select to_regclass('public.business_notification_settings');
--   select to_regclass('public.notification_preferences');
--   select to_regclass('public.notification_delivery_attempts');
--   select relrowsecurity from pg_class where relname in (
--     'business_notification_settings',
--     'notification_preferences',
--     'notification_delivery_attempts'
--   );
--   select tablename, policyname from pg_policies where tablename in (
--     'business_notification_settings',
--     'notification_preferences',
--     'notification_delivery_attempts',
--     'notification_events'
--   ) order by tablename, policyname;
--   notify pgrst, 'reload schema';
--   -- Wait 30-60 seconds, then run authenticated QA for /notifications.

alter table public.notification_events
  add column if not exists recipient_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists recipient_email text,
  add column if not exists recipient_phone text,
  add column if not exists recipient_name text,
  add column if not exists locale text not null default 'en',
  add column if not exists dedupe_key text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists locked_until timestamptz,
  add column if not exists last_attempt_at timestamptz;

create unique index if not exists notification_events_business_dedupe_idx
  on public.notification_events (business_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists notification_events_business_channel_status_idx
  on public.notification_events (business_id, channel, status, created_at desc);

create index if not exists notification_events_dispatch_idx
  on public.notification_events (status, scheduled_for, created_at)
  where channel in ('email', 'sms')
    and status = 'queued';

create table if not exists public.business_notification_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email_enabled boolean not null default false,
  sms_enabled boolean not null default false,
  live_send_enabled boolean not null default false,
  allowed_templates jsonb not null default '{}'::jsonb,
  quiet_hours jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id)
);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  channel public.notification_channel not null,
  template_key text,
  enabled boolean not null default true,
  locale text not null default 'en',
  opted_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_preferences_channel_check
    check (channel in ('email', 'sms')),
  constraint notification_preferences_recipient_check
    check (customer_id is not null or user_id is not null)
);

create unique index if not exists notification_preferences_customer_unique_idx
  on public.notification_preferences (business_id, customer_id, channel, coalesce(template_key, ''))
  where customer_id is not null;

create unique index if not exists notification_preferences_user_unique_idx
  on public.notification_preferences (business_id, user_id, channel, coalesce(template_key, ''))
  where user_id is not null;

create index if not exists notification_preferences_business_idx
  on public.notification_preferences (business_id, channel, enabled);

create table if not exists public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_event_id uuid not null references public.notification_events(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  channel public.notification_channel not null,
  provider text not null,
  status text not null,
  provider_message_id text,
  failure_reason text,
  attempted_at timestamptz not null default now(),
  constraint notification_delivery_attempts_channel_check
    check (channel in ('email', 'sms'))
);

create index if not exists notification_delivery_attempts_event_idx
  on public.notification_delivery_attempts (notification_event_id, attempted_at desc);

create index if not exists notification_delivery_attempts_business_status_idx
  on public.notification_delivery_attempts (business_id, status, attempted_at desc);

alter table public.business_notification_settings enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_delivery_attempts enable row level security;

create policy "business_notification_settings_read_members"
  on public.business_notification_settings
  for select
  using (public.is_business_member(business_id));

create policy "business_notification_settings_manage_settings_roles"
  on public.business_notification_settings
  for all
  using (
    public.has_business_role(
      business_id,
      array['business_owner', 'manager']::public.member_role[]
    )
  )
  with check (
    public.has_business_role(
      business_id,
      array['business_owner', 'manager']::public.member_role[]
    )
  );

create policy "notification_preferences_read_members"
  on public.notification_preferences
  for select
  using (public.is_business_member(business_id));

create policy "notification_preferences_manage_settings_roles"
  on public.notification_preferences
  for all
  using (
    public.has_business_role(
      business_id,
      array['business_owner', 'manager']::public.member_role[]
    )
  )
  with check (
    public.has_business_role(
      business_id,
      array['business_owner', 'manager']::public.member_role[]
    )
  );

create policy "notification_preferences_customer_read_own"
  on public.notification_preferences
  for select
  using (
    customer_id is not null
    and public.is_customer_for_business(business_id, customer_id)
  );

create policy "notification_delivery_attempts_read_members"
  on public.notification_delivery_attempts
  for select
  using (public.is_business_member(business_id));

grant all on table public.business_notification_settings to authenticated, service_role;
grant all on table public.notification_preferences to authenticated, service_role;
grant all on table public.notification_delivery_attempts to authenticated, service_role;
