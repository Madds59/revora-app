-- Tenant isolation hardening for 0034_invoicing_and_appointments.sql.
--
-- THE BUG (APPSEC-17): every policy added in 0034 gates on the row's own
-- `business_id` -- but `business_id` is supplied by the client on INSERT. None
-- of them checked that the row's FOREIGN KEYS point into that same business.
-- Because Postgres evaluates referential-integrity checks with RLS bypassed, an
-- FK aimed at another tenant's row validates happily.
--
-- Concretely, before this migration an owner/manager of business A could POST
-- straight at PostgREST (the anon key is public, and 0034 granted INSERT on
-- these tables to `authenticated`) with:
--
--     { "business_id": "<A>", "invoice_id": "<invoice owned by business B>",
--       "method": "cash", "amount": 999999 }
--
-- ...and the row was accepted. The `invoice_payments_recompute` trigger is
-- SECURITY DEFINER, so it then updated business B's invoice with RLS off,
-- flipping it to `paid`. The same shape let an attacker inject line items and
-- credit notes onto another tenant's invoice (visible to THAT tenant's customer
-- via the `*_customer_read` policies, but invisible to the tenant's own staff),
-- squat another tenant's `branch_appointment_settings` row, and poison another
-- branch's confirmation capacity.
--
-- The fix restores the rule already established by create_quotation_draft() in
-- 0008_secure_quote_creation.sql -- "the customer must belong to the same
-- business" -- and generalises it to every FK on the 0034 tables.

-- ---------------------------------------------------------------------------
-- FK-scoping helpers
--
-- SECURITY DEFINER because the policies that use them run for BOTH staff and
-- portal customers, and a portal customer cannot SELECT public.branches
-- (see branches_members_read in 0002). A plain EXISTS subquery inside the
-- policy would therefore be evaluated under the caller's own RLS and
-- fail closed, breaking legitimate portal booking.
--
-- Each returns TRUE for a NULL id: "there is no reference to validate". The
-- NOT NULL constraint on the column is what makes a reference mandatory.
--
-- Deliberately NOT filtering on `deleted_at`: these answer "does this row live
-- in this tenant", not "is it still active". Mixing soft-delete semantics in
-- would make an UPDATE to an existing invoice start failing the moment its
-- customer was archived.
-- ---------------------------------------------------------------------------

create or replace function public.customer_in_business(
  target_customer_id uuid,
  target_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_customer_id is null or exists (
    select 1 from public.customers c
    where c.id = target_customer_id and c.business_id = target_business_id
  );
$$;

create or replace function public.branch_in_business(
  target_branch_id uuid,
  target_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_branch_id is null or exists (
    select 1 from public.branches b
    where b.id = target_branch_id and b.business_id = target_business_id
  );
$$;

create or replace function public.vehicle_in_business(
  target_vehicle_id uuid,
  target_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_vehicle_id is null or exists (
    select 1 from public.vehicles v
    where v.id = target_vehicle_id and v.business_id = target_business_id
  );
$$;

create or replace function public.job_in_business(
  target_job_id uuid,
  target_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_job_id is null or exists (
    select 1 from public.jobs j
    where j.id = target_job_id and j.business_id = target_business_id
  );
$$;

create or replace function public.quotation_in_business(
  target_quotation_id uuid,
  target_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_quotation_id is null or exists (
    select 1 from public.quotations q
    where q.id = target_quotation_id and q.business_id = target_business_id
  );
$$;

create or replace function public.product_in_business(
  target_product_id uuid,
  target_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_product_id is null or exists (
    select 1 from public.products p
    where p.id = target_product_id and p.business_id = target_business_id
  );
$$;

create or replace function public.vehicle_in_customer(
  target_vehicle_id uuid,
  target_customer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_vehicle_id is null or exists (
    select 1 from public.vehicles v
    where v.id = target_vehicle_id and v.customer_id = target_customer_id
  );
$$;

create or replace function public.invoice_in_business(
  target_invoice_id uuid,
  target_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_invoice_id is null or exists (
    select 1 from public.invoices i
    where i.id = target_invoice_id and i.business_id = target_business_id
  );
$$;

revoke all on function public.customer_in_business(uuid, uuid) from public;
revoke all on function public.branch_in_business(uuid, uuid) from public;
revoke all on function public.vehicle_in_business(uuid, uuid) from public;
revoke all on function public.job_in_business(uuid, uuid) from public;
revoke all on function public.quotation_in_business(uuid, uuid) from public;
revoke all on function public.product_in_business(uuid, uuid) from public;
revoke all on function public.vehicle_in_customer(uuid, uuid) from public;
revoke all on function public.invoice_in_business(uuid, uuid) from public;

grant execute on function public.customer_in_business(uuid, uuid) to authenticated;
grant execute on function public.branch_in_business(uuid, uuid) to authenticated;
grant execute on function public.vehicle_in_business(uuid, uuid) to authenticated;
grant execute on function public.job_in_business(uuid, uuid) to authenticated;
grant execute on function public.quotation_in_business(uuid, uuid) to authenticated;
grant execute on function public.product_in_business(uuid, uuid) to authenticated;
grant execute on function public.vehicle_in_customer(uuid, uuid) to authenticated;
grant execute on function public.invoice_in_business(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Invoices: every FK must land inside the same tenant
-- ---------------------------------------------------------------------------

drop policy if exists "invoices_staff_manage" on public.invoices;
create policy "invoices_staff_manage" on public.invoices
  for all
  using (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
  )
  with check (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
    and public.customer_in_business(customer_id, business_id)
    and public.branch_in_business(branch_id, business_id)
    and public.vehicle_in_business(vehicle_id, business_id)
    and public.job_in_business(job_id, business_id)
    and public.quotation_in_business(quotation_id, business_id)
  );

drop policy if exists "invoice_items_staff_manage" on public.invoice_items;
create policy "invoice_items_staff_manage" on public.invoice_items
  for all
  using (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
  )
  with check (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
    and public.invoice_in_business(invoice_id, business_id)
    and public.product_in_business(product_id, business_id)
  );

drop policy if exists "invoice_payments_staff_manage" on public.invoice_payments;
create policy "invoice_payments_staff_manage" on public.invoice_payments
  for all
  using (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
  )
  with check (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
    and public.invoice_in_business(invoice_id, business_id)
  );

drop policy if exists "invoice_credit_notes_staff_manage" on public.invoice_credit_notes;
create policy "invoice_credit_notes_staff_manage" on public.invoice_credit_notes
  for all
  using (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
  )
  with check (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
    and public.invoice_in_business(invoice_id, business_id)
  );

-- Read side, belt and braces: a child row whose own business_id disagrees with
-- its parent invoice is by construction an injection, and must never render on
-- the victim customer's copy of the document even if one already exists.
drop policy if exists "invoice_items_customer_read" on public.invoice_items;
create policy "invoice_items_customer_read" on public.invoice_items
  for select using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and i.business_id = invoice_items.business_id
        and public.is_customer_for_business(i.business_id, i.customer_id)
        and i.status <> 'draft'
    )
  );

drop policy if exists "invoice_payments_customer_read" on public.invoice_payments;
create policy "invoice_payments_customer_read" on public.invoice_payments
  for select using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_payments.invoice_id
        and i.business_id = invoice_payments.business_id
        and public.is_customer_for_business(i.business_id, i.customer_id)
    )
  );

drop policy if exists "invoice_credit_notes_customer_read" on public.invoice_credit_notes;
create policy "invoice_credit_notes_customer_read" on public.invoice_credit_notes
  for select using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_credit_notes.invoice_id
        and i.business_id = invoice_credit_notes.business_id
        and public.is_customer_for_business(i.business_id, i.customer_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Appointments + branch settings
-- ---------------------------------------------------------------------------

drop policy if exists "appointments_staff_manage" on public.appointments;
create policy "appointments_staff_manage" on public.appointments
  for all
  using (
    public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[])
  )
  with check (
    public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[])
    and public.customer_in_business(customer_id, business_id)
    and public.branch_in_business(branch_id, business_id)
    and public.vehicle_in_business(vehicle_id, business_id)
    and public.quotation_in_business(quotation_id, business_id)
  );

drop policy if exists "appointments_customer_insert" on public.appointments;
create policy "appointments_customer_insert" on public.appointments
  for insert with check (
    public.is_customer_for_business(business_id, customer_id)
    and public.branch_in_business(branch_id, business_id)
    and public.vehicle_in_business(vehicle_id, business_id)
    -- Same business is not enough here: without this, customer X could attach
    -- customer Y's vehicle to their own booking request.
    and public.vehicle_in_customer(vehicle_id, customer_id)
    and created_by = (select auth.uid())
    and status = 'requested'
    and confirmed_start is null
    and confirmed_end is null
    and decline_reason is null
    and quotation_id is null
    and cancelled_by is null
  );

-- branch_id was previously unchecked, so a manager of business A could squat
-- business B's row (the table is `unique (branch_id)`, so B could then never
-- create its own) and dictate B's booking capacity -- confirm_appointment()
-- reads this table as SECURITY DEFINER, with RLS off.
drop policy if exists "branch_appointment_settings_staff_manage" on public.branch_appointment_settings;
create policy "branch_appointment_settings_staff_manage" on public.branch_appointment_settings
  for all
  using (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
  )
  with check (
    public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[])
    and public.branch_in_business(branch_id, business_id)
  );

-- ---------------------------------------------------------------------------
-- Portal branch visibility
--
-- Not a vulnerability -- the opposite. 0002 grants `branches` SELECT only to
-- is_business_member, so the new portal booking page
-- ((portal)/portal/appointments/new/page.tsx) reads an empty branch list and
-- never renders its form. RLS filters silently, so this fails as a blank page
-- rather than an error.
--
-- Recording it here because the obvious repair is the insecure one: reaching
-- for createAdminClient() would give an untrusted-user-facing page an RLS-free
-- read. A linked customer seeing the active branches of a workshop they are
-- already a customer of is precisely the data the booking flow exists to show,
-- so grant exactly that and nothing more. Inactive branches stay hidden.
-- ---------------------------------------------------------------------------

create or replace function public.is_customer_of_business(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customers c
    where c.business_id = target_business_id
      and c.app_user_id = (select auth.uid())
      and c.deleted_at is null
  );
$$;

revoke all on function public.is_customer_of_business(uuid) from public;
grant execute on function public.is_customer_of_business(uuid) to authenticated;

drop policy if exists "branches_customer_read" on public.branches;
create policy "branches_customer_read" on public.branches
  for select using (
    is_active
    and public.is_customer_of_business(business_id)
  );

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER functions: re-scope the RLS-free reads they perform
-- ---------------------------------------------------------------------------

-- Sum only payments booked to the SAME business as the invoice. Without this,
-- a single injected row rewrote another tenant's amount_paid and status.
create or replace function public.recompute_invoice_paid_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  paid numeric(12,2);
  inv public.invoices%rowtype;
begin
  select * into inv from public.invoices where id = target_invoice_id;
  if not found then
    return coalesce(new, old);
  end if;

  select coalesce(sum(p.amount), 0) into paid
  from public.invoice_payments p
  where p.invoice_id = target_invoice_id
    and p.business_id = inv.business_id;

  update public.invoices
    set amount_paid = paid,
        status = case
          when inv.status = 'void' then 'void'::public.invoice_status
          when inv.status = 'draft' then 'draft'::public.invoice_status
          when paid <= 0 then 'issued'::public.invoice_status
          when paid < inv.total then 'partially_paid'::public.invoice_status
          else 'paid'::public.invoice_status
        end
    where id = target_invoice_id;

  return coalesce(new, old);
end;
$$;

-- Capacity was counted across ALL businesses sharing a branch_id. Since a
-- staff member could previously book an appointment onto another tenant's
-- branch, that let business A fill business B's calendar to capacity. Scope the
-- count -- and the settings lookup -- to the appointment's own business.
create or replace function public.confirm_appointment(
  target_appointment_id uuid,
  new_start timestamptz,
  new_end timestamptz
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  appt public.appointments%rowtype;
  max_concurrent integer;
  overlapping integer;
begin
  select * into appt from public.appointments where id = target_appointment_id for update;
  if not found then
    raise exception 'appointment not found' using errcode = '22023';
  end if;

  if not public.has_business_role(appt.business_id, array['business_owner', 'manager', 'employee']::public.member_role[]) then
    raise exception 'not authorized to manage appointments for this business' using errcode = '42501';
  end if;

  if appt.status <> 'requested' then
    raise exception 'only requested appointments can be confirmed' using errcode = '22023';
  end if;

  if new_end <= new_start then
    raise exception 'confirmed end must be after start' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(appt.branch_id::text, 3));

  select coalesce(s.max_concurrent, 1) into max_concurrent
  from public.branch_appointment_settings s
  where s.branch_id = appt.branch_id
    and s.business_id = appt.business_id;
  max_concurrent := coalesce(max_concurrent, 1);

  select count(*) into overlapping
  from public.appointments a
  where a.branch_id = appt.branch_id
    and a.business_id = appt.business_id
    and a.status = 'confirmed'
    and a.id <> appt.id
    and a.confirmed_start < new_end
    and a.confirmed_end > new_start;

  if overlapping >= max_concurrent then
    raise exception 'that slot is at capacity for this branch' using errcode = '22023';
  end if;

  update public.appointments
    set status = 'confirmed', confirmed_start = new_start, confirmed_end = new_end
    where id = target_appointment_id
    returning * into appt;

  return appt;
end;
$$;

-- ---------------------------------------------------------------------------
-- Repair, without destroying evidence
--
-- Deliberately NOT deleting cross-tenant rows: they are the forensic record of
-- whether this was ever exploited, and a migration should not silently discard
-- that. The policies above already make them unwritable and unreadable, and the
-- trigger rewrite already excludes them from every total. This recompute
-- repairs any amount_paid/status that a previously-injected payment corrupted.
--
-- Run public.cross_tenant_reference_audit (below) to see whether any exist.
-- ---------------------------------------------------------------------------

update public.invoices i
  set amount_paid = sub.paid,
      status = case
        when i.status = 'void' then 'void'::public.invoice_status
        when i.status = 'draft' then 'draft'::public.invoice_status
        when sub.paid <= 0 then 'issued'::public.invoice_status
        when sub.paid < i.total then 'partially_paid'::public.invoice_status
        else 'paid'::public.invoice_status
      end
from (
  select i2.id,
         coalesce((
           select sum(p.amount)
           from public.invoice_payments p
           where p.invoice_id = i2.id and p.business_id = i2.business_id
         ), 0) as paid
  from public.invoices i2
) as sub
where i.id = sub.id
  and i.amount_paid is distinct from sub.paid;

create or replace view public.cross_tenant_reference_audit as
  select 'invoice_items' as table_name, ii.id, ii.business_id, i.business_id as parent_business_id
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
   where ii.business_id <> i.business_id
  union all
  select 'invoice_payments', p.id, p.business_id, i.business_id
    from public.invoice_payments p
    join public.invoices i on i.id = p.invoice_id
   where p.business_id <> i.business_id
  union all
  select 'invoice_credit_notes', cn.id, cn.business_id, i.business_id
    from public.invoice_credit_notes cn
    join public.invoices i on i.id = cn.invoice_id
   where cn.business_id <> i.business_id
  union all
  select 'invoices.customer_id', i.id, i.business_id, c.business_id
    from public.invoices i
    join public.customers c on c.id = i.customer_id
   where i.business_id <> c.business_id
  union all
  select 'appointments.customer_id', a.id, a.business_id, c.business_id
    from public.appointments a
    join public.customers c on c.id = a.customer_id
   where a.business_id <> c.business_id
  union all
  select 'appointments.branch_id', a.id, a.business_id, b.business_id
    from public.appointments a
    join public.branches b on b.id = a.branch_id
   where a.business_id <> b.business_id
  union all
  select 'branch_appointment_settings.branch_id', s.id, s.business_id, b.business_id
    from public.branch_appointment_settings s
    join public.branches b on b.id = s.branch_id
   where s.business_id <> b.business_id;

comment on view public.cross_tenant_reference_audit is
  'Operator diagnostic for APPSEC-17: rows whose business_id disagrees with the '
  'business of the row they reference. Such a row cannot be produced legitimately '
  'and indicates the pre-0035 cross-tenant FK injection was exercised. '
  'Service-role/psql only -- not granted to authenticated.';

revoke all on public.cross_tenant_reference_audit from public, authenticated, anon;
