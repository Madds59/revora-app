-- Platform (super admin) layer.
--
-- Super admins are NOT business members and are NOT a flag on profiles (a
-- self-updatable profile column would let any user elevate themselves via the
-- profiles_update_self policy). They live in a dedicated table whose only RLS
-- policy is "read your own row" — there is no insert/update/delete policy, so
-- membership can only be granted out-of-band (service role) or through the
-- SECURITY DEFINER RPCs below, which require an existing super admin.

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- A signed-in user may check whether THEY are a super admin; nothing else.
create policy "platform_admins_select_self" on public.platform_admins
  for select using (user_id = (select auth.uid()));

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid()
  );
$$;

grant execute on function public.is_super_admin() to authenticated;

-- Platform-wide metrics (cross-tenant; bypasses RLS, hence the guard).
create or replace function public.admin_platform_metrics()
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

  select json_build_object(
    'businesses', (select count(*) from public.businesses where deleted_at is null),
    'users', (select count(*) from auth.users),
    'customers', (select count(*) from public.customers where deleted_at is null),
    'quotations', (select count(*) from public.quotations),
    'approved_quotes', (select count(distinct quotation_id) from public.approvals),
    'complaints', (select count(*) from public.complaints),
    'open_complaints', (
      select count(*) from public.complaints
      where status not in ('resolved', 'closed')
    ),
    'super_admins', (select count(*) from public.platform_admins)
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_platform_metrics() to authenticated;

-- Every tenant (business) with owner + rollup counts.
create or replace function public.admin_list_businesses()
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
      b.id,
      b.name,
      b.created_at,
      (
        select u.email
        from public.business_members bm
        join auth.users u on u.id = bm.user_id
        where bm.business_id = b.id and bm.role = 'business_owner' and bm.is_active
        order by bm.created_at
        limit 1
      ) as owner_email,
      (select count(*) from public.business_members bm where bm.business_id = b.id and bm.is_active) as member_count,
      (select count(*) from public.customers c where c.business_id = b.id and c.deleted_at is null) as customer_count,
      (select count(*) from public.quotations q where q.business_id = b.id) as quote_count,
      (select count(*) from public.complaints cp where cp.business_id = b.id) as complaint_count
    from public.businesses b
    where b.deleted_at is null
    order by b.created_at desc
  ) t;

  return result;
end;
$$;

grant execute on function public.admin_list_businesses() to authenticated;

-- The current super admins (for the /admin/admins management screen).
create or replace function public.admin_list_super_admins()
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
    select pa.user_id, u.email, p.full_name, pa.created_at
    from public.platform_admins pa
    join auth.users u on u.id = pa.user_id
    left join public.profiles p on p.id = pa.user_id
    order by pa.created_at
  ) t;

  return result;
end;
$$;

grant execute on function public.admin_list_super_admins() to authenticated;

-- Promote/demote another user (by email). Only callable by an existing super
-- admin. The FIRST super admin must be bootstrapped out-of-band (service role)
-- via scripts/grant-super-admin.mjs.
create or replace function public.admin_set_super_admin(
  target_email text,
  make_admin boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  target uuid;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select id into target from auth.users where lower(email) = lower(btrim(target_email));
  if target is null then
    raise exception 'no user with email % (they must sign up first)', target_email
      using errcode = '22023';
  end if;

  if make_admin then
    insert into public.platform_admins (user_id) values (target)
      on conflict (user_id) do nothing;
  else
    if target = caller then
      raise exception 'you cannot remove your own super admin access'
        using errcode = '42501';
    end if;
    delete from public.platform_admins where user_id = target;
  end if;
end;
$$;

grant execute on function public.admin_set_super_admin(text, boolean) to authenticated;
