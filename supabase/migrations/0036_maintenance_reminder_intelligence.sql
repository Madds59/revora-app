-- Maintenance Reminder Intelligence V1.
--
-- See docs/superpowers/specs/2026-09-04-maintenance-reminder-intelligence-v1-design.md
--
-- Two additive tables:
--   * vehicle_odometer_readings   - append-only odometer history per vehicle
--   * business_maintenance_settings - per-tenant reminder configuration
--
-- Nothing here alters an existing table, so this migration takes no lock on a
-- populated relation.
--
-- Design notes carried into the schema:
--   * Mileage is NOT monotonically constrained. Odometer replacement and the
--     correction of a mistyped reading both produce a legitimately lower value,
--     and rejecting those would discard the vehicle's history at exactly the
--     moment it changed. Readings are recorded and CLASSIFIED instead, and the
--     projection engine refuses to treat a suspicious reading as reliable.
--   * business_maintenance_settings.assumed_annual_km is deliberately NULLABLE.
--     A single odometer reading gives position but not rate, so projecting from
--     one reading requires an explicitly configured per-business driving
--     assumption. There is no invented global default: unconfigured businesses
--     fall back to date-only reminders.
--   * reminders_enabled defaults to false so no tenant begins messaging
--     customers merely because this migration was applied.

-- ---------------------------------------------------------------------------
-- Tenant FK scoping helper (0035 established this pattern)
-- ---------------------------------------------------------------------------

-- Odometer readings may cite the appointment they were captured at. Without
-- this, a reading could carry business A's business_id and business B's
-- appointment_id: Postgres validates referential integrity with RLS bypassed,
-- so the FK alone proves nothing about tenancy.
create or replace function public.appointment_in_business(
  target_appointment_id uuid,
  target_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_appointment_id is null or exists (
    select 1 from public.appointments a
    where a.id = target_appointment_id and a.business_id = target_business_id
  );
$$;

revoke all on function public.appointment_in_business(uuid, uuid) from public;
grant execute on function public.appointment_in_business(uuid, uuid) to authenticated;

-- Symptom reports are the provenance for readings taken from the existing AI
-- diagnosis / health-check flows.
create or replace function public.symptom_report_in_business(
  target_report_id uuid,
  target_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_report_id is null or exists (
    select 1 from public.vehicle_symptom_reports r
    where r.id = target_report_id and r.business_id = target_business_id
  );
$$;

revoke all on function public.symptom_report_in_business(uuid, uuid) from public;
grant execute on function public.symptom_report_in_business(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Odometer readings
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_odometer_readings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  mileage integer not null,
  -- Revora operates in the UAE and records kilometres only. The column exists
  -- so a future unit is a widening change rather than a schema rewrite; the
  -- check keeps today's data unambiguous.
  unit text not null default 'km',
  source text not null,
  source_appointment_id uuid references public.appointments(id) on delete set null,
  source_symptom_report_id uuid references public.vehicle_symptom_reports(id) on delete set null,
  -- Classification is stored, not recomputed, so history keeps the judgement
  -- that was made against the data available at the time.
  quality text not null default 'valid',
  quality_reason text,
  -- When the odometer was OBSERVED, which is not always when the row was written.
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint vehicle_odometer_readings_mileage_plausible
    check (mileage >= 0 and mileage <= 3000000),
  constraint vehicle_odometer_readings_unit_check
    check (unit = 'km'),
  constraint vehicle_odometer_readings_source_check
    check (source in (
      'appointment_check_in',
      'vehicle_diagnosis',
      'portal_health_check',
      'staff_manual',
      'symptom_report_backfill'
    )),
  constraint vehicle_odometer_readings_quality_check
    check (quality in ('valid', 'suspicious', 'unusable'))
);

-- The hot path: the most recent readings for one vehicle. The projection
-- engine reads a bounded window, never a vehicle's whole history.
create index if not exists vehicle_odometer_readings_vehicle_recorded_idx
  on public.vehicle_odometer_readings (vehicle_id, recorded_at desc);

create index if not exists vehicle_odometer_readings_business_idx
  on public.vehicle_odometer_readings (business_id);

-- One reading per source record. A double-submitted form or a retried server
-- action cannot record the same physical observation twice.
create unique index if not exists vehicle_odometer_readings_appointment_uniq
  on public.vehicle_odometer_readings (source_appointment_id)
  where source_appointment_id is not null;

create unique index if not exists vehicle_odometer_readings_symptom_report_uniq
  on public.vehicle_odometer_readings (source_symptom_report_id)
  where source_symptom_report_id is not null;

-- ---------------------------------------------------------------------------
-- Per-business reminder configuration
-- ---------------------------------------------------------------------------

create table if not exists public.business_maintenance_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  reminders_enabled boolean not null default false,
  first_reminder_days integer not null default 14,
  second_reminder_days integer not null default 3,
  -- NULL means "this business has configured no driving assumption", which
  -- makes a single-reading vehicle date-only rather than silently projected.
  assumed_annual_km integer,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id),
  constraint business_maintenance_settings_stage_order
    check (first_reminder_days > second_reminder_days),
  constraint business_maintenance_settings_stage_positive
    check (second_reminder_days > 0 and first_reminder_days <= 365),
  constraint business_maintenance_settings_assumed_km_plausible
    check (assumed_annual_km is null or (assumed_annual_km >= 1000 and assumed_annual_km <= 100000))
);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.vehicle_odometer_readings enable row level security;
alter table public.business_maintenance_settings enable row level security;

-- Staff who physically handle vehicles record readings, so employees are
-- included here (matching appointments_staff_manage in 0034). Every FK is
-- scoped to the row's own business.
create policy "vehicle_odometer_readings_staff_manage" on public.vehicle_odometer_readings
  for all
  using (
    public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[])
  )
  with check (
    public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[])
    and public.vehicle_in_business(vehicle_id, business_id)
    and public.appointment_in_business(source_appointment_id, business_id)
    and public.symptom_report_in_business(source_symptom_report_id, business_id)
  );

-- A customer may read the odometer history of their own vehicles. They cannot
-- write one: a reading is a workshop observation, and the portal health-check
-- path records readings through a server action, not a direct client insert.
create policy "vehicle_odometer_readings_customer_read" on public.vehicle_odometer_readings
  for select using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_odometer_readings.vehicle_id
        and v.business_id = vehicle_odometer_readings.business_id
        and public.is_customer_for_business(v.business_id, v.customer_id)
    )
  );

-- Reminder configuration decides whether customers are messaged at all, so it
-- is owner/manager only, matching business_notification_settings.
create policy "business_maintenance_settings_staff_manage" on public.business_maintenance_settings
  for all
  using (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
  )
  with check (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
  );

-- ---------------------------------------------------------------------------
-- Grants
--
-- Local/self-hosted Postgres does not auto-grant the way hosted Supabase does;
-- see 0003_api_grants.sql for why this block is required.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on
  public.vehicle_odometer_readings,
  public.business_maintenance_settings
  to authenticated;
