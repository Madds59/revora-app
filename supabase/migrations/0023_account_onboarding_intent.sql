-- Persist the user's intended account type so onboarding and post-auth routing
-- can distinguish business owners, customers, and invited staff without
-- treating everyone as a business owner by default.

alter table public.profiles
  add column if not exists account_intent text,
  add column if not exists onboarding_completed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_account_intent_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_intent_check
      check (account_intent is null or account_intent in ('business_owner', 'customer', 'staff_invited'));
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  full_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  intent text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'account_intent', '')), '');
begin
  insert into public.profiles (id, full_name, account_intent)
  values (
    new.id,
    full_name,
    case
      when intent in ('business_owner', 'customer', 'staff_invited') then intent
      else null
    end
  )
  on conflict (id) do update
    set full_name = coalesce(excluded.full_name, public.profiles.full_name),
        account_intent = coalesce(excluded.account_intent, public.profiles.account_intent);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

update public.profiles p
set account_intent = case
  when exists (
    select 1
    from public.business_members bm
    where bm.user_id = p.id
      and bm.is_active
      and bm.role = 'business_owner'
  ) then 'business_owner'
  when exists (
    select 1
    from public.business_members bm
    where bm.user_id = p.id
      and bm.is_active
      and bm.role in ('manager', 'employee')
  ) then 'staff_invited'
  when exists (
    select 1
    from public.customers c
    where c.app_user_id = p.id
      and c.deleted_at is null
  ) then 'customer'
  else p.account_intent
end
where p.account_intent is null;

