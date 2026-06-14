-- Admin frontend support RPCs.
--
-- These functions expose read-only platform views for the root admin UI while
-- keeping cross-tenant access behind SECURITY DEFINER and the existing
-- super-admin guard.

create or replace function public.admin_list_users()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(t)), '[]'::json) into result
  from (
    select
      u.id as user_id,
      u.email,
      p.full_name,
      u.created_at,
      exists (
        select 1 from public.platform_admins pa where pa.user_id = u.id
      ) as is_super_admin,
      (
        select count(*)
        from public.business_members bm
        where bm.user_id = u.id
      ) as business_memberships,
      (
        select count(*)
        from public.customers c
        where c.app_user_id = u.id and c.deleted_at is null
      ) as linked_customers
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by u.created_at desc
  ) t;

  return result;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;

create or replace function public.admin_list_subscriptions()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(t)), '[]'::json) into result
  from (
    select
      s.id,
      s.business_id,
      b.name as business_name,
      s.status,
      s.plan_key,
      s.current_period_start,
      s.current_period_end,
      s.cancel_at_period_end,
      s.created_at
    from public.subscriptions s
    join public.businesses b on b.id = s.business_id
    order by s.created_at desc
  ) t;

  return result;
end;
$$;

grant execute on function public.admin_list_subscriptions() to authenticated;

create or replace function public.admin_list_notifications()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(t)), '[]'::json) into result
  from (
    select
      n.id,
      n.business_id,
      b.name as business_name,
      c.email as customer_email,
      n.channel,
      n.template_key,
      n.status,
      n.created_at,
      n.sent_at,
      n.failure_reason
    from public.notification_events n
    join public.businesses b on b.id = n.business_id
    left join public.customers c on c.id = n.customer_id
    order by n.created_at desc
    limit 100
  ) t;

  return result;
end;
$$;

grant execute on function public.admin_list_notifications() to authenticated;

create or replace function public.admin_list_audit_logs()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(json_agg(row_to_json(t)), '[]'::json) into result
  from (
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
    order by a.created_at desc
    limit 100
  ) t;

  return result;
end;
$$;

grant execute on function public.admin_list_audit_logs() to authenticated;
