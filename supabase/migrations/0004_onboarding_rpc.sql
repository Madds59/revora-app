-- Onboarding bootstrap.
--
-- The first owner cannot be created purely through table policies: inserting
-- the initial business_members row requires reading back the just-created
-- business (RLS), but the creator is not a member yet. This SECURITY DEFINER
-- function runs as the table owner (RLS does not apply to the owner), creating
-- the profile, business, and owner membership atomically.

create or replace function public.create_business(
  business_name text,
  owner_full_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_business_id uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if coalesce(btrim(business_name), '') = '' then
    raise exception 'business name is required' using errcode = '22023';
  end if;

  insert into public.profiles (id, full_name)
  values (uid, nullif(btrim(coalesce(owner_full_name, '')), ''))
  on conflict (id) do update
    set full_name = coalesce(excluded.full_name, public.profiles.full_name);

  insert into public.businesses (name, created_by)
  values (btrim(business_name), uid)
  returning id into new_business_id;

  insert into public.business_members (business_id, user_id, role)
  values (new_business_id, uid, 'business_owner');

  return new_business_id;
end;
$$;

revoke all on function public.create_business(text, text) from public;
grant execute on function public.create_business(text, text) to authenticated;
