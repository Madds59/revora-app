-- Admin filtered / paginated list RPCs.
-- These preserve the existing super-admin guard while making platform lists
-- scalable enough for the UI to search without fetching every row.

create or replace function public.admin_list_businesses_filtered(
  p_search text default null,
  p_status text default null,
  p_plan text default null,
  p_industry text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
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
  search_value text := lower(btrim(coalesce(p_search, '')));
  status_value text := lower(btrim(coalesce(p_status, '')));
  plan_value text := lower(btrim(coalesce(p_plan, '')));
  limit_value integer := greatest(1, least(coalesce(p_limit, 50), 100));
  offset_value integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with latest_subscriptions as (
    select distinct on (s.business_id)
      s.business_id,
      s.id as subscription_id,
      s.status as subscription_status,
      s.plan_key,
      s.current_period_start,
      s.current_period_end,
      s.cancel_at_period_end,
      s.created_at
    from public.subscriptions s
    order by s.business_id, s.created_at desc
  ),
  filtered as (
    select
      b.id,
      b.name,
      b.created_at,
      (
        select u.email
        from public.business_members bm
        join auth.users u on u.id = bm.user_id
        where bm.business_id = b.id
          and bm.role = 'business_owner'
          and bm.is_active
        order by bm.created_at
        limit 1
      ) as owner_email,
      (select count(*) from public.business_members bm where bm.business_id = b.id and bm.is_active) as member_count,
      (select count(*) from public.customers c where c.business_id = b.id and c.deleted_at is null) as customer_count,
      (select count(*) from public.quotations q where q.business_id = b.id) as quote_count,
      (select count(*) from public.complaints cp where cp.business_id = b.id) as complaint_count,
      ls.subscription_status as status,
      ls.plan_key,
      ls.current_period_end,
      null::text as industry
    from public.businesses b
    left join latest_subscriptions ls on ls.business_id = b.id
    where b.deleted_at is null
      and (
        search_value = ''
        or lower(b.name) like '%' || search_value || '%'
        or lower(coalesce((
          select u.email
          from public.business_members bm
          join auth.users u on u.id = bm.user_id
          where bm.business_id = b.id
            and bm.role = 'business_owner'
            and bm.is_active
          order by bm.created_at
          limit 1
        ), '')) like '%' || search_value || '%'
      )
      and (
        status_value = ''
        or lower(coalesce(ls.subscription_status, 'unknown')) = status_value
      )
    and (
      plan_value = ''
      or lower(coalesce(ls.plan_key, 'unknown')) = plan_value
    )
    and (
      p_from is null
      or b.created_at >= p_from
    )
    and (
      p_to is null
      or b.created_at <= p_to
    )
  order by b.created_at desc
  )
  select json_build_object(
    'total_count', (select count(*) from filtered),
    'rows', coalesce((
      select json_agg(row_to_json(paged))
      from (
        select *
        from filtered
        order by created_at desc
        limit limit_value
        offset offset_value
      ) paged
    ), '[]'::json)
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_list_businesses_filtered(text, text, text, text, timestamptz, timestamptz, integer, integer) to authenticated;

create or replace function public.admin_list_users_filtered(
  p_search text default null,
  p_role text default null,
  p_status text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
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
  search_value text := lower(btrim(coalesce(p_search, '')));
  role_value text := lower(btrim(coalesce(p_role, '')));
  status_value text := lower(btrim(coalesce(p_status, '')));
  limit_value integer := greatest(1, least(coalesce(p_limit, 50), 100));
  offset_value integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with role_rollup as (
    select
      bm.user_id,
      case
        when exists (select 1 from public.platform_admins pa where pa.user_id = bm.user_id) then 'super_admin'
        when bool_or(bm.role = 'business_owner') then 'business_owner'
        when bool_or(bm.role = 'manager') then 'manager'
        when bool_or(bm.role = 'employee') then 'employee'
        else 'customer'
      end as role_type,
      bool_or(bm.is_active) as has_active_membership
    from public.business_members bm
    group by bm.user_id
  ),
  filtered as (
    select
      u.id as user_id,
      u.email,
      p.full_name,
      u.created_at,
      exists (select 1 from public.platform_admins pa where pa.user_id = u.id) as is_super_admin,
      (select count(*) from public.business_members bm where bm.user_id = u.id) as business_memberships,
      (select count(*) from public.customers c where c.app_user_id = u.id and c.deleted_at is null) as linked_customers,
      coalesce(rr.role_type, case when (select count(*) from public.customers c where c.app_user_id = u.id and c.deleted_at is null) > 0 then 'customer' else 'user' end) as role_type,
      case
        when coalesce(rr.has_active_membership, false)
          or exists (select 1 from public.customers c where c.app_user_id = u.id and c.deleted_at is null)
          or exists (select 1 from public.platform_admins pa where pa.user_id = u.id)
          then 'active'
        else 'inactive'
      end as status
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join role_rollup rr on rr.user_id = u.id
    where (
      search_value = ''
      or lower(coalesce(u.email, '')) like '%' || search_value || '%'
      or lower(coalesce(p.full_name, '')) like '%' || search_value || '%'
      or lower(u.id::text) like '%' || search_value || '%'
    )
    and (
      role_value = ''
      or role_value = 'all'
      or lower(coalesce(rr.role_type, case when exists (select 1 from public.customers c where c.app_user_id = u.id and c.deleted_at is null) then 'customer' else 'user' end)) = role_value
    )
    and (
      status_value = ''
      or status_value = 'all'
      or (
        status_value = 'active'
        and (
          coalesce(rr.has_active_membership, false)
          or exists (select 1 from public.customers c where c.app_user_id = u.id and c.deleted_at is null)
          or exists (select 1 from public.platform_admins pa where pa.user_id = u.id)
        )
      )
      or (
        status_value = 'inactive'
        and not (
          coalesce(rr.has_active_membership, false)
          or exists (select 1 from public.customers c where c.app_user_id = u.id and c.deleted_at is null)
          or exists (select 1 from public.platform_admins pa where pa.user_id = u.id)
        )
      )
    )
    and (
      p_from is null
      or u.created_at >= p_from
    )
    and (
      p_to is null
      or u.created_at <= p_to
    )
    order by u.created_at desc
  )
  select json_build_object(
    'total_count', (select count(*) from filtered),
    'rows', coalesce((
      select json_agg(row_to_json(paged))
      from (
        select *
        from filtered
        order by created_at desc
        limit limit_value
        offset offset_value
      ) paged
    ), '[]'::json)
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_list_users_filtered(text, text, text, timestamptz, timestamptz, integer, integer) to authenticated;

create or replace function public.admin_list_subscriptions_filtered(
  p_search text default null,
  p_plan text default null,
  p_status text default null,
  p_interval text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
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
  search_value text := lower(btrim(coalesce(p_search, '')));
  plan_value text := lower(btrim(coalesce(p_plan, '')));
  status_value text := lower(btrim(coalesce(p_status, '')));
  interval_value text := lower(btrim(coalesce(p_interval, '')));
  limit_value integer := greatest(1, least(coalesce(p_limit, 50), 100));
  offset_value integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with subscription_rollup as (
    select
      s.id,
      s.business_id,
      b.name as business_name,
      s.status,
      s.plan_key,
      s.current_period_start,
      s.current_period_end,
      s.cancel_at_period_end,
      s.created_at,
      coalesce(
        (
          select case
            when bp.stripe_price_id_monthly is not null and exists (
              select 1 from public.subscription_items si
              where si.subscription_id = s.id
                and si.stripe_price_id = bp.stripe_price_id_monthly
            ) then 'monthly'
            when bp.stripe_price_id_yearly is not null and exists (
              select 1 from public.subscription_items si
              where si.subscription_id = s.id
                and si.stripe_price_id = bp.stripe_price_id_yearly
            ) then 'yearly'
            else null
          end
          from public.billing_plans bp
          where lower(bp.slug) = lower(s.plan_key)
          limit 1
        ),
        'unknown'
      ) as billing_interval
    from public.subscriptions s
    join public.businesses b on b.id = s.business_id
    order by s.created_at desc
  ),
  filtered as (
    select *
    from subscription_rollup
    where (
      search_value = ''
      or lower(business_name) like '%' || search_value || '%'
      or lower(plan_key) like '%' || search_value || '%'
      or lower(status) like '%' || search_value || '%'
    )
    and (
      plan_value = ''
      or lower(plan_key) = plan_value
    )
    and (
      status_value = ''
      or lower(status) = status_value
    )
    and (
      interval_value = ''
      or interval_value = 'all'
      or lower(billing_interval) = interval_value
    )
    and (
      p_from is null
      or created_at >= p_from
    )
    and (
      p_to is null
      or created_at <= p_to
    )
    order by created_at desc
  )
  select json_build_object(
    'total_count', (select count(*) from filtered),
    'rows', coalesce((
      select json_agg(row_to_json(paged))
      from (
        select *
        from filtered
        order by created_at desc
        limit limit_value
        offset offset_value
      ) paged
    ), '[]'::json)
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_list_subscriptions_filtered(text, text, text, text, timestamptz, timestamptz, integer, integer) to authenticated;

create or replace function public.admin_list_audit_logs_filtered(
  p_search text default null,
  p_action text default null,
  p_entity text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
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
  search_value text := lower(btrim(coalesce(p_search, '')));
  action_value text := lower(btrim(coalesce(p_action, '')));
  entity_value text := lower(btrim(coalesce(p_entity, '')));
  limit_value integer := greatest(1, least(coalesce(p_limit, 50), 100));
  offset_value integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with filtered as (
    select
      a.id,
      a.business_id,
      b.name as business_name,
      u.email as actor_email,
      p.full_name as actor_name,
      a.table_name,
      a.record_id,
      a.action,
      a.created_at
    from public.audit_events a
    left join public.businesses b on b.id = a.business_id
    left join auth.users u on u.id = a.actor_id
    left join public.profiles p on p.id = a.actor_id
    where (
      search_value = ''
      or lower(coalesce(b.name, '')) like '%' || search_value || '%'
      or lower(coalesce(u.email, '')) like '%' || search_value || '%'
      or lower(coalesce(p.full_name, '')) like '%' || search_value || '%'
      or lower(a.table_name) like '%' || search_value || '%'
      or lower(a.action) like '%' || search_value || '%'
    )
    and (
      action_value = ''
      or lower(a.action) like '%' || action_value || '%'
    )
    and (
      entity_value = ''
      or lower(a.table_name) like '%' || entity_value || '%'
    )
    and (
      p_from is null
      or a.created_at >= p_from
    )
    and (
      p_to is null
      or a.created_at <= p_to
    )
    order by a.created_at desc
  )
  select json_build_object(
    'total_count', (select count(*) from filtered),
    'rows', coalesce((
      select json_agg(row_to_json(paged))
      from (
        select *
        from filtered
        order by created_at desc
        limit limit_value
        offset offset_value
      ) paged
    ), '[]'::json)
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_list_audit_logs_filtered(text, text, text, timestamptz, timestamptz, integer, integer) to authenticated;

create or replace function public.admin_list_notifications_filtered(
  p_search text default null,
  p_type text default null,
  p_read_state text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
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
  search_value text := lower(btrim(coalesce(p_search, '')));
  type_value text := lower(btrim(coalesce(p_type, '')));
  read_value text := lower(btrim(coalesce(p_read_state, '')));
  limit_value integer := greatest(1, least(coalesce(p_limit, 50), 100));
  offset_value integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with filtered as (
    select
      n.id,
      n.business_id,
      b.name as business_name,
      c.email as customer_email,
      n.channel,
      n.template_key,
      n.status,
      n.created_at,
      n.scheduled_for,
      n.sent_at,
      n.failed_at,
      n.failure_reason,
      n.read_at,
      case
        when n.template_key ilike '%quote%' then 'quote'
        when n.template_key ilike '%complaint%' then 'complaint'
        when n.template_key ilike '%job%' then 'job'
        when n.template_key ilike '%invoice%' or n.template_key ilike '%payment%' or n.template_key ilike '%billing%' then 'billing'
        else 'system'
      end as notification_type
    from public.notification_events n
    join public.businesses b on b.id = n.business_id
    left join public.customers c on c.id = n.customer_id
    where (
      search_value = ''
      or lower(coalesce(n.template_key, '')) like '%' || search_value || '%'
      or lower(coalesce(c.email, '')) like '%' || search_value || '%'
      or lower(coalesce(b.name, '')) like '%' || search_value || '%'
    )
    and (
      type_value = ''
      or lower(
        case
          when n.template_key ilike '%quote%' then 'quote'
          when n.template_key ilike '%complaint%' then 'complaint'
          when n.template_key ilike '%job%' then 'job'
          when n.template_key ilike '%invoice%' or n.template_key ilike '%payment%' or n.template_key ilike '%billing%' then 'billing'
          else 'system'
        end
      ) = type_value
    )
    and (
      read_value = ''
      or read_value = 'all'
      or (read_value = 'read' and n.read_at is not null)
      or (read_value = 'unread' and n.read_at is null)
      or lower(n.status) = read_value
    )
    and (
      p_from is null
      or n.created_at >= p_from
    )
    and (
      p_to is null
      or n.created_at <= p_to
    )
    order by n.created_at desc
  )
  select json_build_object(
    'total_count', (select count(*) from filtered),
    'rows', coalesce((
      select json_agg(row_to_json(paged))
      from (
        select *
        from filtered
        order by created_at desc
        limit limit_value
        offset offset_value
      ) paged
    ), '[]'::json)
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_list_notifications_filtered(text, text, text, timestamptz, timestamptz, integer, integer) to authenticated;
