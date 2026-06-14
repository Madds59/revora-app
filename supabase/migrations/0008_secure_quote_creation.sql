-- Harden create_quotation_draft.
--
-- The previous version (0007) trusted the caller-supplied target_business_id /
-- target_created_by and, being SECURITY DEFINER, bypassed RLS — letting ANY
-- authenticated user create a quotation in ANY business. This adds an explicit
-- authorization gate (caller must be an active owner/manager of the business),
-- verifies the customer/vehicle belong to that business, and forces created_by
-- to the caller's own auth.uid().

create or replace function public.create_quotation_draft(
  target_business_id uuid,
  target_customer_id uuid,
  target_vehicle_id uuid default null,
  target_created_by uuid default null, -- ignored; retained for signature compatibility
  target_currency text default 'AED'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_quote_id uuid;
  next_number integer;
  quote_number text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if target_business_id is null or target_customer_id is null then
    raise exception 'business and customer are required' using errcode = '22023';
  end if;

  -- Authorization: caller must be an active owner/manager of the business.
  if not exists (
    select 1
    from public.business_members bm
    where bm.business_id = target_business_id
      and bm.user_id = uid
      and bm.is_active
      and bm.role in ('business_owner', 'manager')
  ) then
    raise exception 'not authorized to create quotations for this business'
      using errcode = '42501';
  end if;

  -- The customer must belong to the same business.
  if not exists (
    select 1
    from public.customers c
    where c.id = target_customer_id
      and c.business_id = target_business_id
      and c.deleted_at is null
  ) then
    raise exception 'customer does not belong to this business'
      using errcode = '22023';
  end if;

  -- An optional vehicle must belong to that customer.
  if target_vehicle_id is not null and not exists (
    select 1
    from public.vehicles v
    where v.id = target_vehicle_id
      and v.business_id = target_business_id
      and v.customer_id = target_customer_id
  ) then
    raise exception 'vehicle does not belong to this customer'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_business_id::text, 0));

  select coalesce(max((regexp_match(q.quote_number, '^Q-(\d+)$'))[1]::integer), 0) + 1
    into next_number
  from public.quotations q
  where q.business_id = target_business_id
    and q.quote_number ~ '^Q-(\d+)$';

  quote_number := 'Q-' || lpad(next_number::text, 4, '0');

  insert into public.quotations (
    business_id,
    customer_id,
    vehicle_id,
    quote_number,
    currency,
    created_by
  )
  values (
    target_business_id,
    target_customer_id,
    target_vehicle_id,
    quote_number,
    target_currency,
    uid -- forced to the authenticated caller, never the supplied value
  )
  returning id into new_quote_id;

  return new_quote_id;
end;
$$;

revoke all on function public.create_quotation_draft(uuid, uuid, uuid, uuid, text) from public;
grant execute on function public.create_quotation_draft(uuid, uuid, uuid, uuid, text) to authenticated;
