-- Retainer calculator scenarios.
--
-- Tenant-safe, server-recomputed scenario storage for the pricing calculator.

create table public.retainer_pricing_scenarios (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  quote_id uuid references public.quotations(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  customer_type text not null,
  service_category text not null,
  currency text not null default 'AED',
  billing_cycle text not null default 'monthly',
  contract_length_months integer not null default 1,
  number_of_vehicles integer not null default 1,
  expected_monthly_visits numeric not null default 0,
  sla_level text not null default 'standard',
  labor_items jsonb not null default '[]'::jsonb,
  parts_items jsonb not null default '[]'::jsonb,
  tool_items jsonb not null default '[]'::jsonb,
  overhead_items jsonb not null default '{}'::jsonb,
  risk_settings jsonb not null default '{}'::jsonb,
  pricing_settings jsonb not null default '{}'::jsonb,
  calculated_results jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retainer_pricing_scenarios_customer_type_check
    check (customer_type in ('individual', 'fleet', 'corporate', 'government', 'insurance_partner')),
  constraint retainer_pricing_scenarios_service_category_check
    check (
      service_category in (
        'general_workshop_maintenance',
        'detailing',
        'tire_services',
        'inspection_package',
        'fleet_maintenance',
        'custom'
      )
    ),
  constraint retainer_pricing_scenarios_currency_check
    check (currency in ('AED', 'USD', 'SAR')),
  constraint retainer_pricing_scenarios_billing_cycle_check
    check (billing_cycle in ('monthly', 'quarterly', 'annual')),
  constraint retainer_pricing_scenarios_contract_length_check
    check (contract_length_months > 0),
  constraint retainer_pricing_scenarios_vehicles_check
    check (number_of_vehicles > 0),
  constraint retainer_pricing_scenarios_visits_check
    check (expected_monthly_visits >= 0),
  constraint retainer_pricing_scenarios_status_check
    check (status in ('draft', 'active', 'archived', 'converted_to_quote'))
);

create index retainer_pricing_scenarios_business_id_idx
  on public.retainer_pricing_scenarios (business_id);
create index retainer_pricing_scenarios_customer_id_idx
  on public.retainer_pricing_scenarios (customer_id);
create index retainer_pricing_scenarios_quote_id_idx
  on public.retainer_pricing_scenarios (quote_id);
create index retainer_pricing_scenarios_created_by_idx
  on public.retainer_pricing_scenarios (created_by);
create index retainer_pricing_scenarios_status_idx
  on public.retainer_pricing_scenarios (status);
create index retainer_pricing_scenarios_created_at_idx
  on public.retainer_pricing_scenarios (created_at desc);

create trigger retainer_pricing_scenarios_updated_at
  before update on public.retainer_pricing_scenarios
  for each row execute function public.set_updated_at();

alter table public.retainer_pricing_scenarios enable row level security;

create policy "retainer_pricing_scenarios_manage" on public.retainer_pricing_scenarios
  for all
  using (
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
