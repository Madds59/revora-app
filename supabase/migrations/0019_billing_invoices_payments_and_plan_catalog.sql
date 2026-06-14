-- Billing invoices, payment events, and plan catalog.
-- This migration adds the minimal backend needed for billing history,
-- revenue analytics, and a data-driven feature matrix.

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  stripe_invoice_id text unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  invoice_number text,
  status text not null default 'draft',
  currency text not null default 'AED',
  subtotal_amount integer not null default 0,
  tax_amount integer not null default 0,
  total_amount integer not null default 0,
  amount_paid integer not null default 0,
  amount_due integer not null default 0,
  hosted_invoice_url text,
  invoice_pdf_url text,
  period_start timestamptz,
  period_end timestamptz,
  due_date timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_invoices_amounts_non_negative check (
    subtotal_amount >= 0
    and tax_amount >= 0
    and total_amount >= 0
    and amount_paid >= 0
    and amount_due >= 0
  ),
  constraint billing_invoices_currency_upper check (currency = upper(currency)),
  constraint billing_invoices_status_check check (
    status in ('draft', 'open', 'paid', 'uncollectible', 'void', 'deleted')
  )
);

create table if not exists public.billing_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.billing_invoices(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  description text not null,
  quantity numeric not null default 1,
  unit_amount integer not null default 0,
  amount integer not null default 0,
  currency text not null default 'AED',
  period_start timestamptz,
  period_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint billing_invoice_items_quantity_positive check (quantity > 0),
  constraint billing_invoice_items_amount_non_negative check (
    unit_amount >= 0 and amount >= 0
  ),
  constraint billing_invoice_items_currency_upper check (currency = upper(currency))
);

create table if not exists public.billing_payment_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid references public.billing_invoices(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  event_type text not null,
  status text not null,
  amount integer not null default 0,
  currency text not null default 'AED',
  provider text not null default 'stripe',
  provider_event_id text unique,
  raw_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint billing_payment_events_amount_non_negative check (amount >= 0),
  constraint billing_payment_events_currency_upper check (currency = upper(currency))
);

create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  stripe_price_id_monthly text,
  stripe_price_id_yearly text,
  monthly_amount integer,
  yearly_amount integer,
  currency text not null default 'AED',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_plans_monthly_non_negative check (monthly_amount is null or monthly_amount >= 0),
  constraint billing_plans_yearly_non_negative check (yearly_amount is null or yearly_amount >= 0),
  constraint billing_plans_currency_upper check (currency = upper(currency))
);

create table if not exists public.billing_plan_features (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.billing_plans(id) on delete cascade,
  feature_key text not null,
  feature_name text not null,
  description text,
  included boolean not null default true,
  limit_value integer,
  limit_unit text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (plan_id, feature_key)
);

create index if not exists billing_invoices_business_id_idx
  on public.billing_invoices (business_id);

create index if not exists billing_invoices_subscription_id_idx
  on public.billing_invoices (subscription_id);

create index if not exists billing_invoices_status_idx
  on public.billing_invoices (status);

create index if not exists billing_invoices_created_at_idx
  on public.billing_invoices (created_at desc);

create index if not exists billing_invoices_stripe_invoice_id_idx
  on public.billing_invoices (stripe_invoice_id);

create index if not exists billing_invoice_items_invoice_id_idx
  on public.billing_invoice_items (invoice_id);

create index if not exists billing_invoice_items_business_id_idx
  on public.billing_invoice_items (business_id);

create index if not exists billing_payment_events_business_id_idx
  on public.billing_payment_events (business_id);

create index if not exists billing_payment_events_invoice_id_idx
  on public.billing_payment_events (invoice_id);

create index if not exists billing_payment_events_status_idx
  on public.billing_payment_events (status);

create index if not exists billing_payment_events_occurred_at_idx
  on public.billing_payment_events (occurred_at desc);

create index if not exists billing_payment_events_provider_event_id_idx
  on public.billing_payment_events (provider_event_id);

create index if not exists billing_plan_features_plan_id_idx
  on public.billing_plan_features (plan_id);

create index if not exists billing_plan_features_feature_key_idx
  on public.billing_plan_features (feature_key);

alter table public.billing_invoices enable row level security;
alter table public.billing_invoice_items enable row level security;
alter table public.billing_payment_events enable row level security;
alter table public.billing_plans enable row level security;
alter table public.billing_plan_features enable row level security;

drop policy if exists billing_invoices_select_staff on public.billing_invoices;
create policy billing_invoices_select_staff on public.billing_invoices
  for select using (
    public.has_business_role(
      business_id,
      array['business_owner', 'manager']::public.member_role[]
    )
  );

drop policy if exists billing_invoice_items_select_staff on public.billing_invoice_items;
create policy billing_invoice_items_select_staff on public.billing_invoice_items
  for select using (
    public.has_business_role(
      business_id,
      array['business_owner', 'manager']::public.member_role[]
    )
  );

drop policy if exists billing_payment_events_select_staff on public.billing_payment_events;
create policy billing_payment_events_select_staff on public.billing_payment_events
  for select using (
    public.has_business_role(
      business_id,
      array['business_owner', 'manager']::public.member_role[]
    )
  );

drop policy if exists billing_plans_select_authenticated on public.billing_plans;
create policy billing_plans_select_authenticated on public.billing_plans
  for select using (auth.uid() is not null and is_active);

drop policy if exists billing_plan_features_select_authenticated on public.billing_plan_features;
create policy billing_plan_features_select_authenticated on public.billing_plan_features
  for select using (
    auth.uid() is not null
    and exists (
      select 1
      from public.billing_plans bp
      where bp.id = plan_id
        and bp.is_active
    )
  );

drop trigger if exists billing_invoices_updated_at on public.billing_invoices;
create trigger billing_invoices_updated_at
  before update on public.billing_invoices
  for each row execute function public.set_updated_at();

drop trigger if exists billing_plans_updated_at on public.billing_plans;
create trigger billing_plans_updated_at
  before update on public.billing_plans
  for each row execute function public.set_updated_at();

insert into public.billing_plans (
  slug,
  name,
  description,
  monthly_amount,
  yearly_amount,
  currency,
  sort_order,
  metadata
)
values
  (
    'starter',
    'Starter',
    'Core CRM, quotes, jobs, complaints, and billing basics.',
    null,
    null,
    'AED',
    10,
    jsonb_build_object('support', 'standard')
  ),
  (
    'professional',
    'Professional',
    'Advanced operations for growing workshops with more capacity.',
    null,
    null,
    'AED',
    20,
    jsonb_build_object('support', 'priority')
  ),
  (
    'business',
    'Business',
    'Multi-branch operations with higher limits and workflow depth.',
    null,
    null,
    'AED',
    30,
    jsonb_build_object('support', 'priority')
  ),
  (
    'enterprise',
    'Enterprise',
    'Custom scale, controls, and commercial support.',
    null,
    null,
    'AED',
    40,
    jsonb_build_object('support', 'dedicated')
  )
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  monthly_amount = excluded.monthly_amount,
  yearly_amount = excluded.yearly_amount,
  currency = excluded.currency,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.billing_plan_features (
  plan_id,
  feature_key,
  feature_name,
  description,
  included,
  limit_value,
  limit_unit,
  sort_order
)
select p.id, f.feature_key, f.feature_name, f.description, f.included, f.limit_value, f.limit_unit, f.sort_order
from public.billing_plans p
join (
  values
    ('starter', 'customer_management', 'Customer management', 'Customer records, vehicles, and history.', true, 500, 'customers', 10),
    ('starter', 'jobs', 'Jobs', 'Operational job tracking and progress visibility.', true, 250, 'jobs', 20),
    ('starter', 'quotations', 'Quotations', 'Estimates and approvals.', true, 100, 'quotes', 30),
    ('starter', 'customer_portal', 'Customer portal', 'Self-service quote and complaint access.', true, null, null, 40),
    ('starter', 'complaints', 'Complaints', 'Complaint tracking and threaded messaging.', true, null, null, 50),
    ('starter', 'documents', 'Documents', 'Uploaded files and supporting records.', true, 25, 'GB', 60),
    ('starter', 'analytics', 'Analytics', 'Business dashboards and basic reporting.', true, null, null, 70),
    ('starter', 'notifications', 'Notifications', 'Customer-facing notification workflow.', true, 500, 'messages', 80),
    ('starter', 'billing', 'Billing', 'Subscription overview and billing portal access.', true, null, null, 90),
    ('starter', 'team_members', 'Team members', 'Staff accounts and role-based access.', true, 3, 'members', 100),
    ('starter', 'branches', 'Branches', 'Single location operations.', true, 1, 'branches', 110),
    ('starter', 'ai_assistant', 'AI assistant', 'Automated assistance and summaries.', false, null, null, 120),
    ('starter', 'priority_support', 'Priority support', 'Faster support response times.', false, null, null, 130),

    ('professional', 'customer_management', 'Customer management', 'Customer records, vehicles, and history.', true, 2500, 'customers', 10),
    ('professional', 'jobs', 'Jobs', 'Operational job tracking and progress visibility.', true, 1000, 'jobs', 20),
    ('professional', 'quotations', 'Quotations', 'Estimates and approvals.', true, 500, 'quotes', 30),
    ('professional', 'customer_portal', 'Customer portal', 'Self-service quote and complaint access.', true, null, null, 40),
    ('professional', 'complaints', 'Complaints', 'Complaint tracking and threaded messaging.', true, null, null, 50),
    ('professional', 'documents', 'Documents', 'Uploaded files and supporting records.', true, 100, 'GB', 60),
    ('professional', 'analytics', 'Analytics', 'Business dashboards and basic reporting.', true, null, null, 70),
    ('professional', 'notifications', 'Notifications', 'Customer-facing notification workflow.', true, 5000, 'messages', 80),
    ('professional', 'billing', 'Billing', 'Subscription overview and billing portal access.', true, null, null, 90),
    ('professional', 'team_members', 'Team members', 'Staff accounts and role-based access.', true, 10, 'members', 100),
    ('professional', 'branches', 'Branches', 'Multiple locations.', true, 3, 'branches', 110),
    ('professional', 'ai_assistant', 'AI assistant', 'Automated assistance and summaries.', true, 1000, 'credits', 120),
    ('professional', 'priority_support', 'Priority support', 'Faster support response times.', true, null, null, 130),

    ('business', 'customer_management', 'Customer management', 'Customer records, vehicles, and history.', true, 10000, 'customers', 10),
    ('business', 'jobs', 'Jobs', 'Operational job tracking and progress visibility.', true, 5000, 'jobs', 20),
    ('business', 'quotations', 'Quotations', 'Estimates and approvals.', true, 2000, 'quotes', 30),
    ('business', 'customer_portal', 'Customer portal', 'Self-service quote and complaint access.', true, null, null, 40),
    ('business', 'complaints', 'Complaints', 'Complaint tracking and threaded messaging.', true, null, null, 50),
    ('business', 'documents', 'Documents', 'Uploaded files and supporting records.', true, 500, 'GB', 60),
    ('business', 'analytics', 'Analytics', 'Business dashboards and basic reporting.', true, null, null, 70),
    ('business', 'notifications', 'Notifications', 'Customer-facing notification workflow.', true, 25000, 'messages', 80),
    ('business', 'billing', 'Billing', 'Subscription overview and billing portal access.', true, null, null, 90),
    ('business', 'team_members', 'Team members', 'Staff accounts and role-based access.', true, 25, 'members', 100),
    ('business', 'branches', 'Branches', 'Multiple locations.', true, 10, 'branches', 110),
    ('business', 'ai_assistant', 'AI assistant', 'Automated assistance and summaries.', true, 5000, 'credits', 120),
    ('business', 'priority_support', 'Priority support', 'Faster support response times.', true, null, null, 130),

    ('enterprise', 'customer_management', 'Customer management', 'Customer records, vehicles, and history.', true, null, null, 10),
    ('enterprise', 'jobs', 'Jobs', 'Operational job tracking and progress visibility.', true, null, null, 20),
    ('enterprise', 'quotations', 'Quotations', 'Estimates and approvals.', true, null, null, 30),
    ('enterprise', 'customer_portal', 'Customer portal', 'Self-service quote and complaint access.', true, null, null, 40),
    ('enterprise', 'complaints', 'Complaints', 'Complaint tracking and threaded messaging.', true, null, null, 50),
    ('enterprise', 'documents', 'Documents', 'Uploaded files and supporting records.', true, null, null, 60),
    ('enterprise', 'analytics', 'Analytics', 'Business dashboards and basic reporting.', true, null, null, 70),
    ('enterprise', 'notifications', 'Notifications', 'Customer-facing notification workflow.', true, null, null, 80),
    ('enterprise', 'billing', 'Billing', 'Subscription overview and billing portal access.', true, null, null, 90),
    ('enterprise', 'team_members', 'Team members', 'Staff accounts and role-based access.', true, null, null, 100),
    ('enterprise', 'branches', 'Branches', 'Multiple locations.', true, null, null, 110),
    ('enterprise', 'ai_assistant', 'AI assistant', 'Automated assistance and summaries.', true, null, null, 120),
    ('enterprise', 'priority_support', 'Priority support', 'Faster support response times.', true, null, null, 130)
) as f(plan_slug, feature_key, feature_name, description, included, limit_value, limit_unit, sort_order)
  on p.slug = f.plan_slug
on conflict (plan_id, feature_key) do update
set
  feature_name = excluded.feature_name,
  description = excluded.description,
  included = excluded.included,
  limit_value = excluded.limit_value,
  limit_unit = excluded.limit_unit,
  sort_order = excluded.sort_order;

create or replace function public.list_active_billing_plans()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(t) order by t.sort_order), '[]'::json)
    into result
  from (
    select
      p.id,
      p.slug,
      p.name,
      p.description,
      p.stripe_price_id_monthly,
      p.stripe_price_id_yearly,
      p.monthly_amount,
      p.yearly_amount,
      p.currency,
      p.is_active,
      p.sort_order,
      p.metadata,
      coalesce((
        select json_agg(row_to_json(f))
        from (
          select
            pf.id,
            pf.plan_id,
            pf.feature_key,
            pf.feature_name,
            pf.description,
            pf.included,
            pf.limit_value,
            pf.limit_unit,
            pf.sort_order,
            pf.created_at
          from public.billing_plan_features pf
          where pf.plan_id = p.id
          order by pf.sort_order, pf.created_at
        ) f
      ), '[]'::json) as features
    from public.billing_plans p
    where p.is_active
    order by p.sort_order, p.created_at
  ) t;

  return result;
end;
$$;

grant execute on function public.list_active_billing_plans() to authenticated;

create or replace function public.list_business_billing_invoices(
  p_business_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
  limit_value integer := greatest(1, least(coalesce(p_limit, 50), 100));
  offset_value integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_business_member(p_business_id)
    and not public.is_super_admin()
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with filtered as (
    select
      i.id,
      i.business_id,
      i.subscription_id,
      i.stripe_invoice_id,
      i.stripe_customer_id,
      i.stripe_subscription_id,
      i.invoice_number,
      i.status,
      i.currency,
      i.subtotal_amount,
      i.tax_amount,
      i.total_amount,
      i.amount_paid,
      i.amount_due,
      i.hosted_invoice_url,
      i.invoice_pdf_url,
      i.period_start,
      i.period_end,
      i.due_date,
      i.paid_at,
      i.voided_at,
      i.created_at,
      i.updated_at,
      coalesce((
        select count(*)
        from public.billing_invoice_items bii
        where bii.invoice_id = i.id
      ), 0)::int as item_count,
      s.plan_key as subscription_plan_key,
      s.status as subscription_status
    from public.billing_invoices i
    left join public.subscriptions s on s.id = i.subscription_id
    where i.business_id = p_business_id
    order by coalesce(i.paid_at, i.created_at) desc, i.created_at desc
  ),
  paged as (
    select *
    from filtered
    limit limit_value
    offset offset_value
  )
  select json_build_object(
    'total_count', (select count(*) from filtered),
    'rows', coalesce((select json_agg(row_to_json(paged)) from paged), '[]'::json)
  ) into result;

  return result;
end;
$$;

grant execute on function public.list_business_billing_invoices(uuid, integer, integer) to authenticated;

create or replace function public.get_business_revenue_summary(
  p_business_id uuid,
  p_period text default '90d'
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
  period_start timestamptz;
  period_end timestamptz := now();
  period_key text := lower(coalesce(nullif(btrim(p_period), ''), '90d'));
  currency text;
begin
  if not public.is_business_member(p_business_id)
    and not public.is_super_admin()
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  period_start := case period_key
    when '7d' then now() - interval '7 days'
    when '30d' then now() - interval '30 days'
    when '90d' then now() - interval '90 days'
    when 'all' then timestamp with time zone '1970-01-01 00:00:00+00'
    else now() - interval '90 days'
  end;

  select coalesce(
    (
      select currency
      from public.billing_invoices
      where business_id = p_business_id
      order by created_at desc
      limit 1
    ),
    'AED'
  ) into currency;

  select json_build_object(
    'total_paid_revenue',
      coalesce(
        sum(total_amount) filter (
          where status = 'paid'
            and coalesce(paid_at, created_at) between period_start and period_end
        ),
        0
      ),
    'paid_invoices_count',
      coalesce(
        count(*) filter (
          where status = 'paid'
            and coalesce(paid_at, created_at) between period_start and period_end
        ),
        0
      ),
    'open_invoices_count',
      coalesce(
        count(*) filter (where status in ('draft', 'open', 'uncollectible')),
        0
      ),
    'overdue_or_due_invoices_count',
      coalesce(
        count(*) filter (
          where status in ('draft', 'open', 'uncollectible')
            and due_date is not null
            and due_date <= now()
        ),
        0
      ),
    'open_invoice_amount',
      coalesce(
        sum(amount_due) filter (where status in ('draft', 'open', 'uncollectible')),
        0
      ),
    'amount_due',
      coalesce(
        sum(amount_due) filter (where status in ('draft', 'open', 'uncollectible')),
        0
      ),
    'average_invoice_value',
      case
        when coalesce(
          count(*) filter (
            where status = 'paid'
              and coalesce(paid_at, created_at) between period_start and period_end
          ),
          0
        ) = 0 then 0
        else round(
          coalesce(
            sum(total_amount) filter (
              where status = 'paid'
                and coalesce(paid_at, created_at) between period_start and period_end
            ),
            0
          )::numeric
          /
          nullif(
            coalesce(
              count(*) filter (
                where status = 'paid'
                  and coalesce(paid_at, created_at) between period_start and period_end
              ),
              0
            ),
            0
          ),
          2
        )
      end,
    'currency', currency,
    'period_start', period_start,
    'period_end', period_end
  ) into result
  from public.billing_invoices
  where business_id = p_business_id;

  return result;
end;
$$;

grant execute on function public.get_business_revenue_summary(uuid, text) to authenticated;

create or replace function public.get_business_revenue_trend(
  p_business_id uuid,
  p_period text default '90d'
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
  period_key text := lower(coalesce(nullif(btrim(p_period), ''), '90d'));
  period_start timestamptz;
  period_end timestamptz := now();
  granularity text;
begin
  if not public.is_business_member(p_business_id)
    and not public.is_super_admin()
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  period_start := case period_key
    when '7d' then now() - interval '7 days'
    when '30d' then now() - interval '30 days'
    when '90d' then now() - interval '90 days'
    when 'all' then timestamp with time zone '1970-01-01 00:00:00+00'
    else now() - interval '90 days'
  end;

  granularity := case period_key
    when '7d' then 'day'
    else 'month'
  end;

  select coalesce(json_agg(row_to_json(t) order by t.bucket_start), '[]'::json)
    into result
  from (
    select
      date_trunc(granularity, coalesce(i.paid_at, i.created_at)) as bucket_start,
      coalesce(sum(i.total_amount), 0) as revenue,
      count(*)::int as invoice_count,
      coalesce(max(i.currency), 'AED') as currency
    from public.billing_invoices i
    where i.business_id = p_business_id
      and i.status = 'paid'
      and coalesce(i.paid_at, i.created_at) between period_start and period_end
    group by 1
    order by 1
  ) t;

  return result;
end;
$$;

grant execute on function public.get_business_revenue_trend(uuid, text) to authenticated;
