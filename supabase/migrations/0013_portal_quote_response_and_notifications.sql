-- Customer quote response support and richer admin notification state.

alter table public.quotations
  add column if not exists customer_rejection_note text,
  add column if not exists customer_rejected_at timestamptz;

create or replace function public.customer_reject_quote(
  target_quotation_id uuid,
  target_customer_id uuid,
  rejection_note text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  target_business_id uuid;
begin
  select q.business_id
  into target_business_id
  from public.quotations q
  where q.id = target_quotation_id
    and q.customer_id = target_customer_id
    and public.is_customer_for_business(q.business_id, q.customer_id)
  limit 1;

  if target_business_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.quotations q
  set
    status = 'declined',
    customer_rejection_note = nullif(trim(rejection_note), ''),
    customer_rejected_at = now()
  where q.id = target_quotation_id
    and q.customer_id = target_customer_id
    and q.business_id = target_business_id;
end;
$$;

grant execute on function public.customer_reject_quote(uuid, uuid, text) to authenticated;

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
