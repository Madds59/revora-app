-- Revora row-level security policies.
-- These policies assume authenticated users and service-role Edge Functions for privileged orchestration.

create or replace function public.is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.business_id = target_business_id
      and bm.user_id = (select auth.uid())
      and bm.is_active = true
  );
$$;

create or replace function public.has_business_role(target_business_id uuid, allowed_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.business_id = target_business_id
      and bm.user_id = (select auth.uid())
      and bm.role = any(allowed_roles)
      and bm.is_active = true
  );
$$;

create or replace function public.is_customer_for_business(target_business_id uuid, target_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = target_customer_id
      and c.business_id = target_business_id
      and c.app_user_id = (select auth.uid())
      and c.deleted_at is null
  );
$$;

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.branches enable row level security;
alter table public.services enable row level security;
alter table public.terms_versions enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.projects enable row level security;
alter table public.products enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.quotation_revisions enable row level security;
alter table public.approvals enable row level security;
alter table public.approval_events enable row level security;
alter table public.jobs enable row level security;
alter table public.job_tasks enable row level security;
alter table public.job_updates enable row level security;
alter table public.complaints enable row level security;
alter table public.complaint_messages enable row level security;
alter table public.complaint_evidence enable row level security;
alter table public.media_assets enable row level security;
alter table public.documents enable row level security;
alter table public.notification_events enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_items enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles_select_self" on public.profiles
  for select using (id = (select auth.uid()));

create policy "profiles_insert_self" on public.profiles
  for insert with check (id = (select auth.uid()));

create policy "profiles_update_self" on public.profiles
  for update using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "businesses_select_members" on public.businesses
  for select using (public.is_business_member(id));

create policy "businesses_insert_owner" on public.businesses
  for insert with check (created_by = (select auth.uid()));

create policy "businesses_update_owners" on public.businesses
  for update using (public.has_business_role(id, array['business_owner']::public.member_role[]))
  with check (public.has_business_role(id, array['business_owner']::public.member_role[]));

create policy "business_members_select_members" on public.business_members
  for select using (public.is_business_member(business_id));

create policy "business_members_manage_owners" on public.business_members
  for all using (public.has_business_role(business_id, array['business_owner']::public.member_role[]))
  with check (public.has_business_role(business_id, array['business_owner']::public.member_role[]));

create policy "business_members_insert_initial_owner" on public.business_members
  for insert with check (
    user_id = (select auth.uid())
    and role = 'business_owner'
    and exists (
      select 1
      from public.businesses b
      where b.id = business_id
        and b.created_by = (select auth.uid())
    )
  );

create policy "branches_members_read" on public.branches
  for select using (public.is_business_member(business_id));

create policy "branches_manage_managers" on public.branches
  for all using (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]))
  with check (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]));

create policy "services_members_read" on public.services
  for select using (public.is_business_member(business_id));

create policy "services_manage_managers" on public.services
  for all using (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]))
  with check (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]));

create policy "terms_members_read" on public.terms_versions
  for select using (public.is_business_member(business_id));

create policy "terms_customer_read_own_quotes" on public.terms_versions
  for select using (
    exists (
      select 1
      from public.quotations q
      where q.terms_version_id = id
        and public.is_customer_for_business(q.business_id, q.customer_id)
    )
  );

create policy "terms_manage_owners" on public.terms_versions
  for all using (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]))
  with check (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]));

create policy "customers_staff_read" on public.customers
  for select using (public.is_business_member(business_id) or app_user_id = (select auth.uid()));

create policy "customers_staff_manage" on public.customers
  for all using (public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[]))
  with check (public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[]));

create policy "vehicles_access" on public.vehicles
  for select using (
    public.is_business_member(business_id)
    or public.is_customer_for_business(business_id, customer_id)
  );

create policy "vehicles_staff_manage" on public.vehicles
  for all using (public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[]))
  with check (public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[]));

create policy "projects_access" on public.projects
  for select using (
    public.is_business_member(business_id)
    or public.is_customer_for_business(business_id, customer_id)
  );

create policy "projects_staff_manage" on public.projects
  for all using (public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[]))
  with check (public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[]));

create policy "products_members_read" on public.products
  for select using (public.is_business_member(business_id));

create policy "products_customer_read_own_quotes" on public.products
  for select using (
    exists (
      select 1
      from public.quotation_items qi
      join public.quotations q on q.id = qi.quotation_id
      where qi.product_id = products.id
        and public.is_customer_for_business(q.business_id, q.customer_id)
    )
  );

create policy "products_manage_managers" on public.products
  for all using (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]))
  with check (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]));

create policy "quotations_access" on public.quotations
  for select using (
    public.is_business_member(business_id)
    or public.is_customer_for_business(business_id, customer_id)
  );

create policy "quotations_manage_managers" on public.quotations
  for all using (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]))
  with check (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]));

create policy "quotation_items_access" on public.quotation_items
  for select using (
    public.is_business_member(business_id)
    or exists (
      select 1
      from public.quotations q
      where q.id = quotation_id
        and public.is_customer_for_business(q.business_id, q.customer_id)
    )
  );

create policy "quotation_items_manage_managers" on public.quotation_items
  for all using (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]))
  with check (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]));

create policy "quotation_revisions_access" on public.quotation_revisions
  for select using (
    public.is_business_member(business_id)
    or exists (
      select 1
      from public.quotations q
      where q.id = quotation_id
        and public.is_customer_for_business(q.business_id, q.customer_id)
    )
  );

create policy "quotation_revisions_staff_insert" on public.quotation_revisions
  for insert with check (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]));

create policy "approvals_access" on public.approvals
  for select using (
    public.is_business_member(business_id)
    or public.is_customer_for_business(business_id, customer_id)
  );

create policy "approvals_customer_insert" on public.approvals
  for insert with check (public.is_customer_for_business(business_id, customer_id));

create policy "approval_events_access" on public.approval_events
  for select using (public.is_business_member(business_id));

create policy "approval_events_insert_system_or_customer" on public.approval_events
  for insert with check (
    public.is_business_member(business_id)
    or exists (
      select 1
      from public.approvals a
      where a.id = approval_id
        and public.is_customer_for_business(a.business_id, a.customer_id)
    )
  );

create policy "jobs_access" on public.jobs
  for select using (
    public.is_business_member(business_id)
    or public.is_customer_for_business(business_id, customer_id)
  );

create policy "jobs_manage_staff" on public.jobs
  for all using (public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[]))
  with check (public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[]));

create policy "job_tasks_staff_access" on public.job_tasks
  for all using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "job_updates_access" on public.job_updates
  for select using (
    public.is_business_member(business_id)
    or (
      visible_to_customer = true
      and exists (
        select 1
        from public.jobs j
        where j.id = job_id
          and public.is_customer_for_business(j.business_id, j.customer_id)
      )
    )
  );

create policy "job_updates_staff_insert" on public.job_updates
  for insert with check (public.is_business_member(business_id));

create policy "complaints_access" on public.complaints
  for select using (
    public.is_business_member(business_id)
    or public.is_customer_for_business(business_id, customer_id)
  );

create policy "complaints_staff_manage" on public.complaints
  for all using (public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[]))
  with check (public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[]));

create policy "complaints_customer_insert" on public.complaints
  for insert with check (public.is_customer_for_business(business_id, customer_id));

create policy "complaint_messages_access" on public.complaint_messages
  for select using (
    public.is_business_member(business_id)
    or (
      internal_only = false
      and exists (
        select 1
        from public.complaints c
        where c.id = complaint_id
          and public.is_customer_for_business(c.business_id, c.customer_id)
      )
    )
  );

create policy "complaint_messages_insert_participants" on public.complaint_messages
  for insert with check (
    public.is_business_member(business_id)
    or exists (
      select 1
      from public.complaints c
      where c.id = complaint_id
        and public.is_customer_for_business(c.business_id, c.customer_id)
    )
  );

create policy "complaint_evidence_access" on public.complaint_evidence
  for select using (
    public.is_business_member(business_id)
    or exists (
      select 1
      from public.complaints c
      where c.id = complaint_id
        and public.is_customer_for_business(c.business_id, c.customer_id)
    )
  );

create policy "complaint_evidence_insert_participants" on public.complaint_evidence
  for insert with check (
    public.is_business_member(business_id)
    or exists (
      select 1
      from public.complaints c
      where c.id = complaint_id
        and public.is_customer_for_business(c.business_id, c.customer_id)
    )
  );

create policy "media_assets_access" on public.media_assets
  for select using (public.is_business_member(business_id));

create policy "media_assets_customer_read_linked_documents" on public.media_assets
  for select using (
    exists (
      select 1
      from public.documents d
      where d.media_asset_id = media_assets.id
        and d.customer_id is not null
        and public.is_customer_for_business(d.business_id, d.customer_id)
    )
  );

create policy "media_assets_insert_members" on public.media_assets
  for insert with check (public.is_business_member(business_id));

create policy "documents_access" on public.documents
  for select using (
    public.is_business_member(business_id)
    or (
      customer_id is not null
      and public.is_customer_for_business(business_id, customer_id)
    )
  );

create policy "documents_insert_staff" on public.documents
  for insert with check (public.is_business_member(business_id));

create policy "notification_events_staff_read" on public.notification_events
  for select using (public.is_business_member(business_id));

create policy "subscriptions_owner_read" on public.subscriptions
  for select using (public.has_business_role(business_id, array['business_owner']::public.member_role[]));

create policy "subscription_items_owner_read" on public.subscription_items
  for select using (
    exists (
      select 1
      from public.subscriptions s
      where s.id = subscription_id
        and public.has_business_role(s.business_id, array['business_owner']::public.member_role[])
    )
  );

create policy "audit_events_members_read" on public.audit_events
  for select using (business_id is not null and public.is_business_member(business_id));

-- No client delete policies are defined for approval, audit, revision, or evidence tables.
-- Privileged retention/anonymization operations should run through reviewed service-role functions.
