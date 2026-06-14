-- Revora core schema
-- Apply after creating a Supabase project.

create extension if not exists "pgcrypto";

create type public.member_role as enum ('super_admin', 'business_owner', 'manager', 'employee', 'customer');
create type public.quote_status as enum ('draft', 'sent', 'revised', 'approved', 'declined', 'expired', 'cancelled');
create type public.item_kind as enum ('service', 'labor', 'product', 'part');
create type public.product_category as enum ('oem', 'genuine', 'aftermarket', 'refurbished', 'used', 'custom');
create type public.job_status as enum ('pending', 'approved', 'in_progress', 'waiting_parts', 'delayed', 'completed', 'cancelled');
create type public.complaint_status as enum ('open', 'assigned', 'awaiting_customer', 'investigating', 'escalated', 'resolved', 'closed');
create type public.complaint_severity as enum ('low', 'medium', 'high', 'critical');
create type public.notification_channel as enum ('whatsapp', 'facebook', 'instagram', 'tiktok', 'email', 'sms', 'push');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  preferred_language text not null default 'en',
  timezone text not null default 'Asia/Dubai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  tagline text,
  country text not null default 'AE',
  default_language text not null default 'en',
  supported_languages text[] not null default array['en', 'ar'],
  communication_preferences jsonb not null default '{}'::jsonb,
  branding jsonb not null default '{}'::jsonb,
  stripe_customer_id text unique,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null,
  branch_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address jsonb not null default '{}'::jsonb,
  working_hours jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  default_price numeric(12,2),
  default_tax_rate numeric(5,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.terms_versions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  language text not null default 'en',
  body text not null,
  version integer not null,
  is_active boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (business_id, language, version)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  app_user_id uuid references public.profiles(id),
  full_name text not null,
  phone text,
  email text,
  address jsonb not null default '{}'::jsonb,
  preferred_language text not null default 'en',
  marketing_consent boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  make text,
  model text,
  year integer,
  plate_number text,
  vin text,
  color text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  project_type text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category public.product_category not null,
  name text not null,
  brand text,
  part_number text,
  origin text,
  warranty_terms text,
  expected_lifespan text,
  price numeric(12,2),
  availability text,
  supplier text,
  documentation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid references public.branches(id),
  customer_id uuid not null references public.customers(id),
  vehicle_id uuid references public.vehicles(id),
  project_id uuid references public.projects(id),
  terms_version_id uuid references public.terms_versions(id),
  quote_number text not null,
  status public.quote_status not null default 'draft',
  current_version integer not null default 1,
  language text not null default 'en',
  currency text not null default 'AED',
  subtotal numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  expected_completion_date date,
  warranty_terms text,
  internal_notes text,
  customer_notes text,
  sent_at timestamptz,
  expires_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, quote_number)
);

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  product_id uuid references public.products(id),
  kind public.item_kind not null,
  product_category public.product_category,
  name text not null,
  description text,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  time_estimate_minutes integer,
  transparency jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quotation_revisions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (quotation_id, version)
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id),
  customer_id uuid not null references public.customers(id),
  quotation_version integer not null,
  terms_version_id uuid references public.terms_versions(id),
  language text not null,
  acknowledgement_text text not null,
  signature_asset_id uuid,
  ip_address inet,
  user_agent text,
  device_data jsonb not null default '{}'::jsonb,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (quotation_id, quotation_version)
);

create table public.approval_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  approval_id uuid not null references public.approvals(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  quotation_id uuid references public.quotations(id),
  customer_id uuid not null references public.customers(id),
  branch_id uuid references public.branches(id),
  status public.job_status not null default 'pending',
  title text not null,
  description text,
  expected_completion_at timestamptz,
  completed_at timestamptz,
  assigned_to uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  title text not null,
  description text,
  is_completed boolean not null default false,
  assigned_to uuid references public.profiles(id),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_updates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  status public.job_status,
  message text not null,
  visible_to_customer boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  quotation_id uuid references public.quotations(id),
  job_id uuid references public.jobs(id),
  status public.complaint_status not null default 'open',
  severity public.complaint_severity not null default 'medium',
  subject text not null,
  description text not null,
  assigned_to uuid references public.profiles(id),
  escalated_at timestamptz,
  resolved_at timestamptz,
  resolution_summary text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.complaint_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  sender_id uuid references public.profiles(id),
  sender_role public.member_role not null,
  body text not null,
  internal_only boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.complaint_evidence (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  media_asset_id uuid,
  description text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  bucket text not null,
  object_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  purpose text not null,
  visibility text not null default 'private',
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (bucket, object_path)
);

alter table public.approvals
  add constraint approvals_signature_asset_id_fkey
  foreign key (signature_asset_id) references public.media_assets(id);

alter table public.complaint_evidence
  add constraint complaint_evidence_media_asset_id_fkey
  foreign key (media_asset_id) references public.media_assets(id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id),
  quotation_id uuid references public.quotations(id),
  complaint_id uuid references public.complaints(id),
  job_id uuid references public.jobs(id),
  media_asset_id uuid not null references public.media_assets(id),
  document_type text not null,
  title text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id),
  channel public.notification_channel not null,
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  provider_message_id text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  stripe_subscription_id text unique not null,
  status public.subscription_status not null,
  plan_key text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  entitlements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscription_items (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  stripe_price_id text not null,
  product_key text not null,
  quantity integer not null default 1,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigserial primary key,
  business_id uuid references public.businesses(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  table_name text not null,
  record_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger businesses_updated_at before update on public.businesses for each row execute function public.set_updated_at();
create trigger business_members_updated_at before update on public.business_members for each row execute function public.set_updated_at();
create trigger branches_updated_at before update on public.branches for each row execute function public.set_updated_at();
create trigger services_updated_at before update on public.services for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger vehicles_updated_at before update on public.vehicles for each row execute function public.set_updated_at();
create trigger projects_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger quotations_updated_at before update on public.quotations for each row execute function public.set_updated_at();
create trigger quotation_items_updated_at before update on public.quotation_items for each row execute function public.set_updated_at();
create trigger jobs_updated_at before update on public.jobs for each row execute function public.set_updated_at();
create trigger job_tasks_updated_at before update on public.job_tasks for each row execute function public.set_updated_at();
create trigger complaints_updated_at before update on public.complaints for each row execute function public.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();

create trigger audit_businesses after insert or update or delete on public.businesses for each row execute function public.audit_row_change();
create trigger audit_business_members after insert or update or delete on public.business_members for each row execute function public.audit_row_change();
create trigger audit_customers after insert or update or delete on public.customers for each row execute function public.audit_row_change();
create trigger audit_quotations after insert or update or delete on public.quotations for each row execute function public.audit_row_change();
create trigger audit_quotation_items after insert or update or delete on public.quotation_items for each row execute function public.audit_row_change();
create trigger audit_quotation_revisions after insert or update or delete on public.quotation_revisions for each row execute function public.audit_row_change();
create trigger audit_approvals after insert or update or delete on public.approvals for each row execute function public.audit_row_change();
create trigger audit_jobs after insert or update or delete on public.jobs for each row execute function public.audit_row_change();
create trigger audit_job_updates after insert or update or delete on public.job_updates for each row execute function public.audit_row_change();
create trigger audit_complaints after insert or update or delete on public.complaints for each row execute function public.audit_row_change();
create trigger audit_complaint_messages after insert or update or delete on public.complaint_messages for each row execute function public.audit_row_change();
create trigger audit_documents after insert or update or delete on public.documents for each row execute function public.audit_row_change();
create trigger audit_media_assets after insert or update or delete on public.media_assets for each row execute function public.audit_row_change();
create trigger audit_subscriptions after insert or update or delete on public.subscriptions for each row execute function public.audit_row_change();

create index business_members_business_id_idx on public.business_members (business_id);
create index business_members_user_id_idx on public.business_members (user_id);
create index branches_business_id_idx on public.branches (business_id);
create index services_business_id_idx on public.services (business_id);
create index terms_versions_business_id_idx on public.terms_versions (business_id);
create index customers_business_id_idx on public.customers (business_id);
create index customers_app_user_id_idx on public.customers (app_user_id);
create index vehicles_business_customer_idx on public.vehicles (business_id, customer_id);
create index projects_business_customer_idx on public.projects (business_id, customer_id);
create index products_business_id_idx on public.products (business_id);
create index quotations_business_status_idx on public.quotations (business_id, status);
create index quotations_customer_id_idx on public.quotations (customer_id);
create index quotation_items_quotation_id_idx on public.quotation_items (quotation_id);
create index quotation_revisions_quotation_id_idx on public.quotation_revisions (quotation_id);
create index approvals_quotation_id_idx on public.approvals (quotation_id);
create index approvals_customer_id_idx on public.approvals (customer_id);
create index jobs_business_status_idx on public.jobs (business_id, status);
create index jobs_customer_id_idx on public.jobs (customer_id);
create index job_tasks_job_id_idx on public.job_tasks (job_id);
create index job_updates_job_id_idx on public.job_updates (job_id);
create index complaints_business_status_idx on public.complaints (business_id, status);
create index complaints_customer_id_idx on public.complaints (customer_id);
create index complaint_messages_complaint_id_idx on public.complaint_messages (complaint_id);
create index complaint_evidence_complaint_id_idx on public.complaint_evidence (complaint_id);
create index media_assets_business_id_idx on public.media_assets (business_id);
create index documents_business_customer_idx on public.documents (business_id, customer_id);
create index notification_events_business_status_idx on public.notification_events (business_id, status);
create index subscriptions_business_id_idx on public.subscriptions (business_id);
create index audit_events_business_created_idx on public.audit_events (business_id, created_at desc);

create index quotations_awaiting_approval_idx
  on public.quotations (business_id, sent_at desc)
  where status = 'sent';

create index complaints_open_idx
  on public.complaints (business_id, severity, created_at desc)
  where status in ('open', 'assigned', 'investigating', 'escalated');

create index jobs_active_idx
  on public.jobs (business_id, expected_completion_at)
  where status in ('pending', 'approved', 'in_progress', 'waiting_parts', 'delayed');

create index notification_events_queued_idx
  on public.notification_events (scheduled_for, created_at)
  where status = 'queued';
