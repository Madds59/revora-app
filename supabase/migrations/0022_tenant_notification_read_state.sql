-- Tenant-safe notification read state helpers for the business dashboard.

create or replace function public.mark_business_notification_read(target_notification_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  target_business_id uuid;
begin
  select business_id
  into target_business_id
  from public.notification_events
  where id = target_notification_id;

  if target_business_id is null or not public.is_business_member(target_business_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.notification_events
  set
    read_at = coalesce(read_at, now()),
    read_by = coalesce(read_by, auth.uid()::uuid)
  where id = target_notification_id;
end;
$$;

grant execute on function public.mark_business_notification_read(uuid) to authenticated;

create or replace function public.mark_business_notifications_read(target_business_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  updated_count integer := 0;
begin
  if target_business_id is null or not public.is_business_member(target_business_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.notification_events
  set
    read_at = coalesce(read_at, now()),
    read_by = coalesce(read_by, auth.uid()::uuid)
  where business_id = target_business_id
    and read_at is null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

grant execute on function public.mark_business_notifications_read(uuid) to authenticated;
