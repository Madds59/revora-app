-- Customer complaints hardening.
--
-- The original complaint policies allowed any complaint participant to insert
-- internal-only messages and arbitrary sender roles. Split staff and customer
-- insert paths so the database enforces the same boundaries as the app.

alter table public.complaint_messages
  add column if not exists parent_message_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'complaint_messages_parent_message_id_fkey'
  ) then
    alter table public.complaint_messages
      add constraint complaint_messages_parent_message_id_fkey
      foreign key (parent_message_id)
      references public.complaint_messages(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists complaint_messages_parent_message_id_idx
  on public.complaint_messages (parent_message_id);

drop policy if exists "complaints_customer_insert" on public.complaints;
create policy "complaints_customer_insert" on public.complaints
  for insert with check (
    public.is_customer_for_business(business_id, customer_id)
    and created_by = (select auth.uid())
    and status = 'open'
    and assigned_to is null
    and escalated_at is null
    and resolved_at is null
    and resolution_summary is null
  );

drop policy if exists "complaint_messages_insert_participants" on public.complaint_messages;

create policy "complaint_messages_staff_insert" on public.complaint_messages
  for insert with check (
    public.is_business_member(business_id)
    and sender_id = (select auth.uid())
    and sender_role in ('business_owner', 'manager', 'employee', 'super_admin')
    and exists (
      select 1
      from public.complaints c
      where c.id = complaint_id
        and c.business_id = complaint_messages.business_id
    )
  );

create policy "complaint_messages_customer_insert" on public.complaint_messages
  for insert with check (
    internal_only = false
    and sender_id = (select auth.uid())
    and sender_role = 'customer'
    and exists (
      select 1
      from public.complaints c
      where c.id = complaint_id
        and c.business_id = complaint_messages.business_id
        and public.is_customer_for_business(c.business_id, c.customer_id)
    )
  );
