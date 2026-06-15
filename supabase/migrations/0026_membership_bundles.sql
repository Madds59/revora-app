-- Membership / pricing bundles.
--
-- Business-defined recurring service tiers (Essential/Growth/Premium/custom),
-- optionally generated from a retainer pricing scenario. Owner/manager-managed;
-- published bundles are readable by the business's linked customers.

create table public.membership_bundles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  scenario_id uuid references public.retainer_pricing_scenarios(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  name text not null,
  tier text not null default 'custom',
  description text,
  currency text not null default 'AED',
  billing_cycle text not null default 'monthly',
  price numeric(12, 2) not null default 0,
  included_visits numeric not null default 0,
  included_labor_hours numeric not null default 0,
  sla_level text not null default 'standard',
  features jsonb not null default '[]'::jsonb,
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_bundles_tier_check
    check (tier in ('essential', 'growth', 'premium', 'custom')),
  constraint membership_bundles_currency_check
    check (currency in ('AED', 'USD', 'SAR')),
  constraint membership_bundles_billing_cycle_check
    check (billing_cycle in ('monthly', 'quarterly', 'annual')),
  constraint membership_bundles_price_check
    check (price >= 0),
  constraint membership_bundles_visits_check
    check (included_visits >= 0),
  constraint membership_bundles_labor_hours_check
    check (included_labor_hours >= 0)
);

create index membership_bundles_business_id_idx
  on public.membership_bundles (business_id);
create index membership_bundles_scenario_id_idx
  on public.membership_bundles (scenario_id);
create index membership_bundles_created_by_idx
  on public.membership_bundles (created_by);
create index membership_bundles_published_idx
  on public.membership_bundles (business_id, is_published);
create index membership_bundles_sort_order_idx
  on public.membership_bundles (business_id, sort_order);

create trigger membership_bundles_updated_at
  before update on public.membership_bundles
  for each row execute function public.set_updated_at();

alter table public.membership_bundles enable row level security;

-- Owner/manager (and platform admin) manage all bundles for their business.
create policy "membership_bundles_manage" on public.membership_bundles
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

-- A business's linked customers may read its PUBLISHED bundles only.
create policy "membership_bundles_customer_read" on public.membership_bundles
  for select
  using (
    is_published
    and exists (
      select 1
      from public.customers c
      where c.business_id = membership_bundles.business_id
        and c.app_user_id = auth.uid()
    )
  );
