-- Teammate invitations.
--
-- An owner invites a manager/employee by email. The invitee signs up normally;
-- on first load claim_business_invitations() (SECURITY DEFINER) turns any
-- pending invitations matching their email into business_members rows — the
-- same email-claim pattern used for customers. Table RLS can't create the
-- initial membership for a non-member, so the RPC handles it.

create table public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null,
  role public.member_role not null,
  status text not null default 'pending', -- pending | accepted | revoked
  invited_by uuid references public.profiles(id),
  accepted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint business_invitations_role_check
    check (role in ('manager', 'employee')),
  constraint business_invitations_status_check
    check (status in ('pending', 'accepted', 'revoked'))
);

create index business_invitations_business_idx
  on public.business_invitations (business_id);
create index business_invitations_email_idx
  on public.business_invitations (lower(email));
create unique index business_invitations_pending_unique
  on public.business_invitations (business_id, lower(email))
  where status = 'pending';

alter table public.business_invitations enable row level security;

-- Staff can see invitations for their business.
create policy "business_invitations_read_members" on public.business_invitations
  for select using (public.is_business_member(business_id));

-- Owners create/revoke invitations (and only for manager/employee roles).
create policy "business_invitations_manage_owner" on public.business_invitations
  for all
  using (public.has_business_role(business_id, array['business_owner']::public.member_role[]))
  with check (
    public.has_business_role(business_id, array['business_owner']::public.member_role[])
    and role in ('manager', 'employee')
  );

create or replace function public.claim_business_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  user_name text := nullif(btrim(coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', '')), '');
  accepted integer := 0;
  inv record;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if user_email is null then
    return 0;
  end if;

  insert into public.profiles (id, full_name)
  values (uid, user_name)
  on conflict (id) do nothing;

  for inv in
    select * from public.business_invitations
    where status = 'pending' and lower(email) = user_email
  loop
    insert into public.business_members (business_id, user_id, role)
    values (inv.business_id, uid, inv.role)
    on conflict (business_id, user_id) do nothing;

    update public.business_invitations
      set status = 'accepted', accepted_by = uid, accepted_at = now()
      where id = inv.id;

    accepted := accepted + 1;
  end loop;

  return accepted;
end;
$$;

revoke all on function public.claim_business_invitations() from public;
grant execute on function public.claim_business_invitations() to authenticated;
