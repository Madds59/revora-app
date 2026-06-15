-- Vehicle Intelligence module.
--
-- Core approach:
-- - keep the existing vehicles/customers/quotations/business_members model
-- - add tenant-scoped AI/reporting tables that hang off vehicles
-- - expose customer-safe portal data through SECURITY DEFINER snapshot helpers
-- - preserve RLS for tenant reads and writes

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_vehicle_business_member(target_vehicle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.vehicles v
    where v.id = target_vehicle_id
      and public.is_business_member(v.business_id)
  );
$$;

create or replace function public.is_customer_for_vehicle(target_vehicle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.vehicles v
    join public.customers c on c.id = v.customer_id
    where v.id = target_vehicle_id
      and c.app_user_id = (select auth.uid())
      and c.deleted_at is null
  );
$$;

create table public.vehicle_symptom_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  submitted_by_type text not null,
  symptoms text not null,
  symptom_tags text[] not null default '{}'::text[],
  mileage integer,
  driving_condition text,
  warning_lights text[] not null default '{}'::text[],
  severity_input text,
  source text not null,
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_symptom_reports_submitted_by_type_check
    check (submitted_by_type in ('customer', 'staff', 'owner', 'system')),
  constraint vehicle_symptom_reports_source_check
    check (source in ('portal', 'dashboard')),
  constraint vehicle_symptom_reports_status_check
    check (status in ('submitted', 'analyzed', 'reviewed', 'archived'))
);

create index vehicle_symptom_reports_business_id_idx
  on public.vehicle_symptom_reports (business_id);
create index vehicle_symptom_reports_vehicle_id_idx
  on public.vehicle_symptom_reports (vehicle_id);
create index vehicle_symptom_reports_customer_id_idx
  on public.vehicle_symptom_reports (customer_id);
create index vehicle_symptom_reports_status_idx
  on public.vehicle_symptom_reports (status);
create index vehicle_symptom_reports_created_at_idx
  on public.vehicle_symptom_reports (created_at desc);

create table public.vehicle_diagnostic_results (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  symptom_report_id uuid references public.vehicle_symptom_reports(id) on delete set null,
  generated_by uuid references public.profiles(id) on delete set null,
  diagnosis_json jsonb not null,
  severity text not null,
  stop_driving_warning boolean not null default false,
  workshop_required boolean not null default true,
  quote_draft_eligible boolean not null default false,
  advisor_summary text,
  customer_explanation text,
  model text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_diagnostic_results_severity_check
    check (severity in ('low', 'medium', 'high', 'critical'))
);

create index vehicle_diagnostic_results_business_id_idx
  on public.vehicle_diagnostic_results (business_id);
create index vehicle_diagnostic_results_vehicle_id_idx
  on public.vehicle_diagnostic_results (vehicle_id);
create index vehicle_diagnostic_results_symptom_report_id_idx
  on public.vehicle_diagnostic_results (symptom_report_id);
create index vehicle_diagnostic_results_severity_idx
  on public.vehicle_diagnostic_results (severity);
create index vehicle_diagnostic_results_created_at_idx
  on public.vehicle_diagnostic_results (created_at desc);

create table public.vehicle_dtc_codes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  diagnostic_result_id uuid references public.vehicle_diagnostic_results(id) on delete set null,
  code text not null,
  system text,
  title text,
  description text,
  severity text,
  source text not null,
  created_at timestamptz not null default now(),
  constraint vehicle_dtc_codes_source_check
    check (source in ('manual', 'obd_upload', 'ai', 'verified_database'))
);

create index vehicle_dtc_codes_business_id_idx
  on public.vehicle_dtc_codes (business_id);
create index vehicle_dtc_codes_vehicle_id_idx
  on public.vehicle_dtc_codes (vehicle_id);
create index vehicle_dtc_codes_diagnostic_result_id_idx
  on public.vehicle_dtc_codes (diagnostic_result_id);
create index vehicle_dtc_codes_code_idx
  on public.vehicle_dtc_codes (code);
create index vehicle_dtc_codes_created_at_idx
  on public.vehicle_dtc_codes (created_at desc);

create table public.vehicle_maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  generated_by uuid references public.profiles(id) on delete set null,
  plan_json jsonb not null,
  next_service_date date,
  next_service_mileage integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vehicle_maintenance_plans_business_id_idx
  on public.vehicle_maintenance_plans (business_id);
create index vehicle_maintenance_plans_vehicle_id_idx
  on public.vehicle_maintenance_plans (vehicle_id);
create index vehicle_maintenance_plans_created_at_idx
  on public.vehicle_maintenance_plans (created_at desc);

create table public.vehicle_media_uploads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  media_type text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint vehicle_media_uploads_media_type_check
    check (media_type in ('image', 'video', 'document', 'audio', 'other'))
);

create index vehicle_media_uploads_business_id_idx
  on public.vehicle_media_uploads (business_id);
create index vehicle_media_uploads_vehicle_id_idx
  on public.vehicle_media_uploads (vehicle_id);
create index vehicle_media_uploads_customer_id_idx
  on public.vehicle_media_uploads (customer_id);
create index vehicle_media_uploads_created_at_idx
  on public.vehicle_media_uploads (created_at desc);

create table public.ai_tool_calls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  tool_name text not null,
  input_json jsonb not null,
  output_json jsonb,
  model text,
  status text not null,
  error_message text,
  safety_flagged boolean not null default false,
  duration_ms integer,
  created_at timestamptz not null default now(),
  constraint ai_tool_calls_status_check
    check (status in ('success', 'error', 'blocked'))
);

create index ai_tool_calls_business_id_idx
  on public.ai_tool_calls (business_id);
create index ai_tool_calls_vehicle_id_idx
  on public.ai_tool_calls (vehicle_id);
create index ai_tool_calls_tool_name_idx
  on public.ai_tool_calls (tool_name);
create index ai_tool_calls_created_at_idx
  on public.ai_tool_calls (created_at desc);

create table public.ai_safety_flags (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  symptom_report_id uuid references public.vehicle_symptom_reports(id) on delete set null,
  diagnostic_result_id uuid references public.vehicle_diagnostic_results(id) on delete set null,
  triggered_by text not null,
  risk_level text not null,
  reason text not null,
  matched_terms text[] not null default '{}'::text[],
  stop_driving_warning boolean not null default false,
  created_at timestamptz not null default now(),
  constraint ai_safety_flags_risk_level_check
    check (risk_level in ('low', 'medium', 'high', 'critical'))
);

create index ai_safety_flags_business_id_idx
  on public.ai_safety_flags (business_id);
create index ai_safety_flags_vehicle_id_idx
  on public.ai_safety_flags (vehicle_id);
create index ai_safety_flags_symptom_report_id_idx
  on public.ai_safety_flags (symptom_report_id);
create index ai_safety_flags_diagnostic_result_id_idx
  on public.ai_safety_flags (diagnostic_result_id);
create index ai_safety_flags_risk_level_idx
  on public.ai_safety_flags (risk_level);
create index ai_safety_flags_created_at_idx
  on public.ai_safety_flags (created_at desc);

alter table public.vehicle_symptom_reports enable row level security;
alter table public.vehicle_diagnostic_results enable row level security;
alter table public.vehicle_dtc_codes enable row level security;
alter table public.vehicle_maintenance_plans enable row level security;
alter table public.vehicle_media_uploads enable row level security;
alter table public.ai_tool_calls enable row level security;
alter table public.ai_safety_flags enable row level security;

create policy "vehicle_symptom_reports_read" on public.vehicle_symptom_reports
  for select using (
    public.is_vehicle_business_member(vehicle_id)
    or public.is_customer_for_vehicle(vehicle_id)
  );

create policy "vehicle_symptom_reports_insert" on public.vehicle_symptom_reports
  for insert with check (
    (
      public.is_vehicle_business_member(vehicle_id)
      and submitted_by = (select auth.uid())
      and submitted_by_type in ('staff', 'owner', 'system')
    )
    or (
      public.is_customer_for_vehicle(vehicle_id)
      and submitted_by = (select auth.uid())
      and submitted_by_type = 'customer'
    )
  );

create policy "vehicle_symptom_reports_update_staff" on public.vehicle_symptom_reports
  for update using (public.is_vehicle_business_member(vehicle_id))
  with check (public.is_vehicle_business_member(vehicle_id));

create policy "vehicle_diagnostic_results_read" on public.vehicle_diagnostic_results
  for select using (
    public.is_vehicle_business_member(vehicle_id)
    or public.is_platform_admin()
  );

create policy "vehicle_diagnostic_results_insert" on public.vehicle_diagnostic_results
  for insert with check (
    (
      public.is_vehicle_business_member(vehicle_id)
      and generated_by = (select auth.uid())
    )
    or (
      symptom_report_id is not null
      and exists (
        select 1
        from public.vehicle_symptom_reports r
        where r.id = symptom_report_id
          and r.vehicle_id = vehicle_id
          and r.business_id = business_id
          and r.submitted_by = (select auth.uid())
      )
    )
  );

create policy "vehicle_diagnostic_results_update" on public.vehicle_diagnostic_results
  for update using (public.is_vehicle_business_member(vehicle_id))
  with check (public.is_vehicle_business_member(vehicle_id));

create policy "vehicle_dtc_codes_read" on public.vehicle_dtc_codes
  for select using (
    public.is_vehicle_business_member(vehicle_id)
    or public.is_platform_admin()
  );

create policy "vehicle_dtc_codes_insert" on public.vehicle_dtc_codes
  for insert with check (
    public.is_vehicle_business_member(vehicle_id)
    and exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and v.business_id = business_id
    )
  );

create policy "vehicle_maintenance_plans_read" on public.vehicle_maintenance_plans
  for select using (
    public.is_vehicle_business_member(vehicle_id)
    or public.is_platform_admin()
  );

create policy "vehicle_maintenance_plans_insert" on public.vehicle_maintenance_plans
  for insert with check (
    public.is_vehicle_business_member(vehicle_id)
    and generated_by = (select auth.uid())
  );

create policy "vehicle_maintenance_plans_update" on public.vehicle_maintenance_plans
  for update using (public.is_vehicle_business_member(vehicle_id))
  with check (public.is_vehicle_business_member(vehicle_id));

create policy "vehicle_media_uploads_read" on public.vehicle_media_uploads
  for select using (
    public.is_vehicle_business_member(vehicle_id)
    or public.is_customer_for_vehicle(vehicle_id)
    or public.is_platform_admin()
  );

create policy "vehicle_media_uploads_insert" on public.vehicle_media_uploads
  for insert with check (
    (
      public.is_vehicle_business_member(vehicle_id)
      or public.is_customer_for_vehicle(vehicle_id)
    )
    and uploaded_by = (select auth.uid())
    and exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and v.business_id = business_id
    )
  );

create policy "ai_tool_calls_read" on public.ai_tool_calls
  for select using (
    public.is_vehicle_business_member(vehicle_id)
    or public.is_platform_admin()
  );

create policy "ai_tool_calls_insert" on public.ai_tool_calls
  for insert with check (
    (
      public.is_vehicle_business_member(vehicle_id)
      or public.is_customer_for_vehicle(vehicle_id)
      or vehicle_id is null
    )
    and (
      business_id is null
      or exists (
        select 1
        from public.vehicles v
        where v.id = vehicle_id
          and v.business_id = business_id
      )
    )
  );

create policy "ai_safety_flags_read" on public.ai_safety_flags
  for select using (
    public.is_vehicle_business_member(vehicle_id)
    or public.is_platform_admin()
  );

create policy "ai_safety_flags_insert" on public.ai_safety_flags
  for insert with check (
    (
      public.is_vehicle_business_member(vehicle_id)
      or public.is_customer_for_vehicle(vehicle_id)
      or vehicle_id is null
    )
    and (
      business_id is null
      or exists (
        select 1
        from public.vehicles v
        where v.id = vehicle_id
          and v.business_id = business_id
      )
    )
  );

create trigger vehicle_symptom_reports_updated_at
  before update on public.vehicle_symptom_reports
  for each row execute function public.set_updated_at();

create trigger vehicle_diagnostic_results_updated_at
  before update on public.vehicle_diagnostic_results
  for each row execute function public.set_updated_at();

create trigger vehicle_maintenance_plans_updated_at
  before update on public.vehicle_maintenance_plans
  for each row execute function public.set_updated_at();

create or replace function public.get_vehicle_portal_snapshot(target_vehicle_id uuid)
returns table (
  vehicle_id uuid,
  business_id uuid,
  business_name text,
  customer_id uuid,
  customer_name text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year integer,
  plate_number text,
  vin text,
  color text,
  latest_report_id uuid,
  latest_report_status text,
  latest_report_created_at timestamptz,
  latest_report_symptoms text,
  latest_report_severity_input text,
  latest_diagnostic_id uuid,
  latest_diagnostic_severity text,
  stop_driving_warning boolean,
  workshop_required boolean,
  customer_explanation text,
  latest_plan_id uuid,
  next_service_date date,
  next_service_mileage integer,
  media_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not (
    public.is_vehicle_business_member(target_vehicle_id)
    or public.is_customer_for_vehicle(target_vehicle_id)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    v.id,
    v.business_id,
    b.name,
    v.customer_id,
    c.full_name,
    v.make,
    v.model,
    v.year,
    v.plate_number,
    v.vin,
    v.color,
    r.id,
    r.status,
    r.created_at,
    r.symptoms,
    r.severity_input,
    d.id,
    d.severity,
    d.stop_driving_warning,
    d.workshop_required,
    d.customer_explanation,
    p.id,
    p.next_service_date,
    p.next_service_mileage,
    coalesce(m.media_count, 0)::bigint
  from public.vehicles v
  join public.businesses b on b.id = v.business_id
  left join public.customers c on c.id = v.customer_id
  left join lateral (
    select *
    from public.vehicle_symptom_reports r2
    where r2.vehicle_id = v.id
    order by r2.created_at desc, r2.id desc
    limit 1
  ) r on true
  left join lateral (
    select *
    from public.vehicle_diagnostic_results d2
    where d2.vehicle_id = v.id
    order by d2.created_at desc, d2.id desc
    limit 1
  ) d on true
  left join lateral (
    select *
    from public.vehicle_maintenance_plans p2
    where p2.vehicle_id = v.id
    order by p2.created_at desc, p2.id desc
    limit 1
  ) p on true
  left join lateral (
    select count(*) as media_count
    from public.vehicle_media_uploads mu
    where mu.vehicle_id = v.id
  ) m on true
  where v.id = target_vehicle_id;
end;
$$;

revoke all on function public.get_vehicle_portal_snapshot(uuid) from public;
grant execute on function public.get_vehicle_portal_snapshot(uuid) to authenticated;
