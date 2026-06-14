-- Customer portal enablement.
--
-- 1) Let portal users link to their customer records by email (SECURITY DEFINER
--    so it can touch rows they cannot yet see and ensure their profile exists).
-- 2) Let a linked customer read the businesses they belong to (for showing the
--    workshop name in the portal). RLS otherwise hides businesses from non-members.

create or replace function public.claim_customer_records()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  user_name text := nullif(btrim(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', '')), '');
  linked integer := 0;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.profiles (id, full_name)
  values (uid, user_name)
  on conflict (id) do nothing;

  if user_email is null then
    return 0;
  end if;

  update public.customers
    set app_user_id = uid
    where app_user_id is null
      and deleted_at is null
      and lower(customers.email) = user_email;
  get diagnostics linked = row_count;

  return linked;
end;
$$;

revoke all on function public.claim_customer_records() from public;
grant execute on function public.claim_customer_records() to authenticated;

create policy "businesses_customer_read" on public.businesses
  for select using (
    exists (
      select 1
      from public.customers c
      where c.business_id = businesses.id
        and c.app_user_id = (select auth.uid())
        and c.deleted_at is null
    )
  );
