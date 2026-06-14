-- Notification read state and Stripe customer portal support.

alter table public.notification_events
  add column if not exists read_at timestamptz,
  add column if not exists read_by uuid references public.profiles(id) on delete set null;

create or replace function public.admin_mark_notification_read(notification_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.notification_events
  set
    read_at = coalesce(read_at, now()),
    read_by = coalesce(read_by, auth.uid()::uuid)
  where id = notification_id;
end;
$$;

grant execute on function public.admin_mark_notification_read(uuid) to authenticated;

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
      n.scheduled_for,
      n.sent_at,
      n.failed_at,
      n.failure_reason,
      n.read_at
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
