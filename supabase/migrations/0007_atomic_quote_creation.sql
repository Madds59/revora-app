-- Atomic quotation creation.
--
-- Quote numbers must be allocated inside the database so concurrent quote
-- creation cannot produce duplicate `Q-XXXX` values under the per-business
-- unique constraint.

create or replace function public.create_quotation_draft(
  target_business_id uuid,
  target_customer_id uuid,
  target_vehicle_id uuid default null,
  target_created_by uuid default null,
  target_currency text default 'AED'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_quote_id uuid;
  next_number integer;
  quote_number text;
begin
  if target_business_id is null or target_customer_id is null then
    raise exception 'business and customer are required' using errcode = '22023';
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
    target_created_by
  )
  returning id into new_quote_id;

  return new_quote_id;
end;
$$;

revoke all on function public.create_quotation_draft(uuid, uuid, uuid, uuid, text) from public;
grant execute on function public.create_quotation_draft(uuid, uuid, uuid, uuid, text) to authenticated;
