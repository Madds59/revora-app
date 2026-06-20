-- Launch operations foundation: feedback, implementation progress, and onboarding readiness.

create table public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_by_email text,
  submitted_by_name text,
  submitted_role text not null default 'unknown',
  source text not null default 'web',
  locale text not null default 'en',
  category text not null,
  severity text not null default 'normal',
  title text not null,
  description text not null,
  page_url text,
  browser_info text,
  status text not null default 'new',
  priority text not null default 'normal',
  metadata jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedback_reports_category_check check (
    category in (
      'feedback',
      'suggestion',
      'feature_request',
      'report_problem',
      'onboarding_help',
      'support_request'
    )
  ),
  constraint feedback_reports_severity_check check (
    severity in ('low', 'normal', 'high', 'urgent')
  ),
  constraint feedback_reports_status_check check (
    status in (
      'new',
      'triaged',
      'planned',
      'in_progress',
      'resolved',
      'closed',
      'duplicate'
    )
  ),
  constraint feedback_reports_priority_check check (
    priority in ('low', 'normal', 'high', 'urgent')
  ),
  constraint feedback_reports_locale_check check (locale in ('en', 'ar'))
);

create index feedback_reports_business_created_idx
  on public.feedback_reports (business_id, created_at desc);
create index feedback_reports_business_status_idx
  on public.feedback_reports (business_id, status, created_at desc);
create index feedback_reports_business_severity_idx
  on public.feedback_reports (business_id, severity, created_at desc);
create index feedback_reports_business_category_idx
  on public.feedback_reports (business_id, category, created_at desc);
create index feedback_reports_business_priority_idx
  on public.feedback_reports (business_id, priority, created_at desc);
create index feedback_reports_customer_idx
  on public.feedback_reports (customer_id, created_at desc);

create trigger feedback_reports_updated_at
  before update on public.feedback_reports
  for each row execute function public.set_updated_at();

alter table public.feedback_reports enable row level security;

create policy "feedback_reports_read_business_or_own" on public.feedback_reports
  for select using (
    public.is_platform_admin()
    or public.has_business_role(
      business_id,
      array['business_owner', 'manager', 'employee']::public.member_role[]
    )
    or public.is_customer_for_business(business_id, customer_id)
    or submitted_by = (select auth.uid())
  );

create policy "feedback_reports_insert_business_or_customer" on public.feedback_reports
  for insert with check (
    submitted_by = (select auth.uid())
    and (
      public.is_platform_admin()
      or public.has_business_role(
        business_id,
        array['business_owner', 'manager', 'employee']::public.member_role[]
      )
      or (
        customer_id is not null
        and public.is_customer_for_business(business_id, customer_id)
      )
    )
  );

create policy "feedback_reports_update_owners_managers" on public.feedback_reports
  for update using (
    public.is_platform_admin()
    or public.has_business_role(
      business_id,
      array['business_owner', 'manager']::public.member_role[]
    )
  )
  with check (
    public.is_platform_admin()
    or public.has_business_role(
      business_id,
      array['business_owner', 'manager']::public.member_role[]
    )
  );

create table public.business_implementation_progress (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade unique,
  stage text not null default 'not_started',
  checklist jsonb not null default '{
    "business_profile": false,
    "branches": false,
    "team": false,
    "services": false,
    "customers": false,
    "vehicles": false,
    "quotes": false,
    "jobs": false,
    "complaints": false,
    "documents": false,
    "customer_portal": false,
    "notifications": false,
    "billing": false
  }'::jsonb,
  notes text,
  assigned_owner uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_implementation_progress_stage_check check (
    stage in (
      'not_started',
      'discovery',
      'setup',
      'data_preparation',
      'pilot',
      'active',
      'blocked',
      'completed'
    )
  )
);

create index business_implementation_progress_stage_idx
  on public.business_implementation_progress (stage);

create trigger business_implementation_progress_updated_at
  before update on public.business_implementation_progress
  for each row execute function public.set_updated_at();

alter table public.business_implementation_progress enable row level security;

create policy "business_implementation_progress_read_members" on public.business_implementation_progress
  for select using (
    public.is_platform_admin()
    or public.is_business_member(business_id)
  );

create policy "business_implementation_progress_manage_owners_managers" on public.business_implementation_progress
  for all using (
    public.is_platform_admin()
    or public.has_business_role(
      business_id,
      array['business_owner', 'manager']::public.member_role[]
    )
  )
  with check (
    public.is_platform_admin()
    or public.has_business_role(
      business_id,
      array['business_owner', 'manager']::public.member_role[]
    )
  );
