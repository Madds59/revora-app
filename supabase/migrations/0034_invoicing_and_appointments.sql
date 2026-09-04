-- Customer-facing invoicing (workshop -> customer, distinct from billing_invoices
-- which is Revora's own Stripe SaaS billing of the tenant) and appointments
-- (booking requests that feed the existing quote/approval/job pipeline).
--
-- Design notes:
-- * Invoice numbering is gapless and gated at ISSUE time, not draft-creation
--   time, so abandoned drafts never burn a number. Mirrors the advisory-lock
--   pattern in 0008_secure_quote_creation.sql (create_quotation_draft).
-- * An issued invoice is never deleted. Voiding is only permitted before any
--   payment is recorded; once paid, corrections go through a linked credit
--   note (its own gapless CN- sequence) rather than mutating history.
-- * businesses.trn is UAE-TRN-shaped (15 digits) but this schema does not
--   itself certify FTA compliance -- see column comment.
-- * Appointments convert into a QUOTATION draft, never directly into a job.
--   Jobs are only ever created by handle_quote_approved() (0015) from an
--   approved quote -- this preserves that single entry point rather than
--   adding a second, inconsistent path into public.jobs.

-- ---------------------------------------------------------------------------
-- Businesses: Tax Registration Number
-- ---------------------------------------------------------------------------

alter table public.businesses
  add column if not exists trn text;

comment on column public.businesses.trn is
  'UAE Tax Registration Number (15 digits), used on issued invoices. '
  'Structured to FTA Tax Invoice requirements (TRN + sequential numbering + '
  'per-line VAT) but this is engineering scaffolding, not a compliance '
  'certification -- verify against the current FTA executive regulation '
  'before relying on generated invoices as your sole tax record.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'businesses_trn_format'
  ) then
    alter table public.businesses
      add constraint businesses_trn_format
      check (trn is null or trn ~ '^[0-9]{15}$');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invoicing
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type public.invoice_status as enum (
      'draft', 'issued', 'partially_paid', 'paid', 'void'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'invoice_payment_method') then
    create type public.invoice_payment_method as enum (
      'cash', 'card_in_shop', 'bank_transfer', 'online_card', 'other'
    );
  end if;
end;
$$;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid references public.branches(id),
  job_id uuid references public.jobs(id),
  quotation_id uuid references public.quotations(id),
  customer_id uuid not null references public.customers(id),
  vehicle_id uuid references public.vehicles(id),
  invoice_number text,
  status public.invoice_status not null default 'draft',
  language text not null default 'en',
  currency text not null default 'AED',
  business_trn text,
  subtotal numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  balance_due numeric(12,2) generated always as (total - amount_paid) stored,
  notes text,
  issued_at timestamptz,
  due_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, invoice_number)
);

create index if not exists invoices_business_id_idx on public.invoices (business_id);
create index if not exists invoices_customer_id_idx on public.invoices (customer_id);
create index if not exists invoices_job_id_idx on public.invoices (job_id);
create index if not exists invoices_status_idx on public.invoices (business_id, status);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  product_id uuid references public.products(id),
  kind public.item_kind not null,
  product_category public.product_category,
  name text not null,
  description text,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  method public.invoice_payment_method not null,
  amount numeric(12,2) not null,
  paid_at timestamptz not null default now(),
  reference text,
  notes text,
  -- Unused today; reserved so a future Stripe Connect online-payment flow
  -- (customer pays the invoice by card from the portal) can populate these
  -- without a schema rewrite. See design discussion: payments are offline
  -- (cash/card-in-shop/bank transfer) for this slice.
  provider text,
  provider_payment_id text,
  provider_status text,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint invoice_payments_amount_positive check (amount > 0)
);

create index if not exists invoice_payments_invoice_id_idx on public.invoice_payments (invoice_id);

create table if not exists public.invoice_credit_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id),
  credit_note_number text,
  amount numeric(12,2) not null,
  reason text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint invoice_credit_notes_amount_positive check (amount > 0),
  unique (business_id, credit_note_number)
);

create index if not exists invoice_credit_notes_invoice_id_idx on public.invoice_credit_notes (invoice_id);

-- Keep invoices.amount_paid (and derived status) consistent with the
-- payments table from every write path, rather than trusting each caller to
-- recompute it -- this is the single source of truth read by staff and
-- portal surfaces alike.
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
  select coalesce(sum(amount), 0) into paid
  from public.invoice_payments
  where invoice_id = target_invoice_id;

  select * into inv from public.invoices where id = target_invoice_id;
  if not found then
    return coalesce(new, old);
  end if;

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

drop trigger if exists invoice_payments_recompute on public.invoice_payments;
create trigger invoice_payments_recompute
  after insert or update or delete on public.invoice_payments
  for each row execute function public.recompute_invoice_paid_status();

-- Issue a draft invoice: assigns the gapless sequential number and freezes
-- the business TRN onto the document. Requires the business to have a TRN
-- on file so an issued invoice is never missing the field FTA requires.
create or replace function public.issue_invoice(target_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv public.invoices%rowtype;
  biz_trn text;
  next_number integer;
  new_number text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into inv from public.invoices where id = target_invoice_id for update;
  if not found then
    raise exception 'invoice not found' using errcode = '22023';
  end if;

  if not public.has_business_role(inv.business_id, array['business_owner', 'manager']::public.member_role[]) then
    raise exception 'not authorized to issue invoices for this business' using errcode = '42501';
  end if;

  if inv.status <> 'draft' then
    raise exception 'only draft invoices can be issued' using errcode = '22023';
  end if;

  select trn into biz_trn from public.businesses where id = inv.business_id;
  if biz_trn is null then
    raise exception 'business TRN must be set before issuing invoices' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(inv.business_id::text, 1));

  select coalesce(max((regexp_match(i.invoice_number, '^INV-(\d+)$'))[1]::integer), 0) + 1
    into next_number
  from public.invoices i
  where i.business_id = inv.business_id
    and i.invoice_number ~ '^INV-(\d+)$';

  new_number := 'INV-' || lpad(next_number::text, 4, '0');

  update public.invoices
    set invoice_number = new_number,
        business_trn = biz_trn,
        status = 'issued',
        issued_at = now()
    where id = target_invoice_id
    returning * into inv;

  return inv;
end;
$$;

-- Void a draft or issued-but-unpaid invoice. Once any payment is recorded,
-- history is corrected with a credit note instead (see
-- create_invoice_credit_note) so an issued tax document is never mutated
-- after money has changed hands.
create or replace function public.void_invoice(target_invoice_id uuid, reason text)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
begin
  select * into inv from public.invoices where id = target_invoice_id for update;
  if not found then
    raise exception 'invoice not found' using errcode = '22023';
  end if;

  if not public.has_business_role(inv.business_id, array['business_owner', 'manager']::public.member_role[]) then
    raise exception 'not authorized to void invoices for this business' using errcode = '42501';
  end if;

  if inv.status = 'void' then
    raise exception 'invoice is already void' using errcode = '22023';
  end if;

  if inv.amount_paid > 0 then
    raise exception 'cannot void an invoice with recorded payments; issue a credit note instead' using errcode = '22023';
  end if;

  if reason is null or length(trim(reason)) = 0 then
    raise exception 'a reason is required to void an invoice' using errcode = '22023';
  end if;

  update public.invoices
    set status = 'void', voided_at = now(), void_reason = reason
    where id = target_invoice_id
    returning * into inv;

  return inv;
end;
$$;

-- Issue a credit note against a paid/partially-paid invoice. The original
-- invoice is left untouched (still 'issued'/'partially_paid'/'paid') for
-- audit trail; the credit note is its own numbered document that reduces
-- net revenue. This is the FTA-correct way to correct a document after
-- payment, and is what unblocks corrections that void_invoice deliberately
-- refuses once money has moved.
create or replace function public.create_invoice_credit_note(
  target_invoice_id uuid,
  amount numeric,
  reason text
)
returns public.invoice_credit_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  next_number integer;
  new_number text;
  result public.invoice_credit_notes%rowtype;
begin
  select * into inv from public.invoices where id = target_invoice_id for update;
  if not found then
    raise exception 'invoice not found' using errcode = '22023';
  end if;

  if not public.has_business_role(inv.business_id, array['business_owner', 'manager']::public.member_role[]) then
    raise exception 'not authorized to issue credit notes for this business' using errcode = '42501';
  end if;

  if inv.status not in ('issued', 'partially_paid', 'paid') then
    raise exception 'credit notes can only be issued against an issued invoice' using errcode = '22023';
  end if;

  if amount is null or amount <= 0 then
    raise exception 'credit note amount must be positive' using errcode = '22023';
  end if;

  if reason is null or length(trim(reason)) = 0 then
    raise exception 'a reason is required to issue a credit note' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(inv.business_id::text, 2));

  select coalesce(max((regexp_match(c.credit_note_number, '^CN-(\d+)$'))[1]::integer), 0) + 1
    into next_number
  from public.invoice_credit_notes c
  where c.business_id = inv.business_id
    and c.credit_note_number ~ '^CN-(\d+)$';

  new_number := 'CN-' || lpad(next_number::text, 4, '0');

  insert into public.invoice_credit_notes (business_id, invoice_id, credit_note_number, amount, reason, created_by)
  values (inv.business_id, inv.id, new_number, amount, reason, auth.uid())
  returning * into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'appointment_status') then
    create type public.appointment_status as enum (
      'requested', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show'
    );
  end if;
end;
$$;

create table if not exists public.branch_appointment_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  slot_duration_minutes integer not null default 30,
  max_concurrent integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id),
  constraint branch_appointment_settings_positive check (
    slot_duration_minutes > 0 and max_concurrent > 0
  )
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  customer_id uuid not null references public.customers(id),
  vehicle_id uuid references public.vehicles(id),
  quotation_id uuid references public.quotations(id),
  status public.appointment_status not null default 'requested',
  notes text,
  requested_start timestamptz not null,
  requested_end timestamptz not null,
  confirmed_start timestamptz,
  confirmed_end timestamptz,
  decline_reason text,
  cancelled_by uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_requested_window check (requested_end > requested_start),
  constraint appointments_confirmed_window check (
    confirmed_start is null or confirmed_end > confirmed_start
  )
);

create index if not exists appointments_business_id_idx on public.appointments (business_id);
create index if not exists appointments_customer_id_idx on public.appointments (customer_id);
create index if not exists appointments_branch_status_idx on public.appointments (branch_id, status);
create index if not exists appointments_confirmed_window_idx on public.appointments (branch_id, confirmed_start, confirmed_end)
  where status = 'confirmed';

-- Confirm a requested appointment, assigning the final time window. Capacity
-- is enforced here (not just in the UI) by counting overlapping confirmed
-- appointments at the branch against branch_appointment_settings.max_concurrent,
-- serialized per-branch with an advisory lock so two staff confirming the
-- same slot concurrently can't both succeed.
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
  where s.branch_id = appt.branch_id;
  max_concurrent := coalesce(max_concurrent, 1);

  select count(*) into overlapping
  from public.appointments a
  where a.branch_id = appt.branch_id
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

create or replace function public.decline_appointment(target_appointment_id uuid, reason text)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  appt public.appointments%rowtype;
begin
  select * into appt from public.appointments where id = target_appointment_id for update;
  if not found then
    raise exception 'appointment not found' using errcode = '22023';
  end if;

  if not public.has_business_role(appt.business_id, array['business_owner', 'manager', 'employee']::public.member_role[]) then
    raise exception 'not authorized to manage appointments for this business' using errcode = '42501';
  end if;

  if appt.status <> 'requested' then
    raise exception 'only requested appointments can be declined' using errcode = '22023';
  end if;

  update public.appointments
    set status = 'declined', decline_reason = reason
    where id = target_appointment_id
    returning * into appt;

  return appt;
end;
$$;

-- Either staff (any active member) or the appointment's own customer can
-- cancel, but only out of requested/confirmed -- never re-opening a
-- declined/completed/no_show row.
create or replace function public.cancel_appointment(target_appointment_id uuid)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  appt public.appointments%rowtype;
  is_staff boolean;
  is_owning_customer boolean;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into appt from public.appointments where id = target_appointment_id for update;
  if not found then
    raise exception 'appointment not found' using errcode = '22023';
  end if;

  is_staff := public.is_business_member(appt.business_id);
  is_owning_customer := public.is_customer_for_business(appt.business_id, appt.customer_id);

  if not (is_staff or is_owning_customer) then
    raise exception 'not authorized to cancel this appointment' using errcode = '42501';
  end if;

  if appt.status not in ('requested', 'confirmed') then
    raise exception 'only requested or confirmed appointments can be cancelled' using errcode = '22023';
  end if;

  update public.appointments
    set status = 'cancelled', cancelled_by = uid
    where id = target_appointment_id
    returning * into appt;

  return appt;
end;
$$;

-- Convert a confirmed appointment into a quotation DRAFT (never directly
-- into a job -- jobs are only ever created by handle_quote_approved() from
-- an approved quote, and this preserves that single entry point). Reuses
-- the same gapless Q- numbering as create_quotation_draft.
create or replace function public.convert_appointment_to_quotation(target_appointment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  appt public.appointments%rowtype;
  new_quote_id uuid;
  next_number integer;
  quote_number text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into appt from public.appointments where id = target_appointment_id for update;
  if not found then
    raise exception 'appointment not found' using errcode = '22023';
  end if;

  if not public.has_business_role(appt.business_id, array['business_owner', 'manager']::public.member_role[]) then
    raise exception 'not authorized to create quotations for this business' using errcode = '42501';
  end if;

  if appt.quotation_id is not null then
    return appt.quotation_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(appt.business_id::text, 0));

  select coalesce(max((regexp_match(q.quote_number, '^Q-(\d+)$'))[1]::integer), 0) + 1
    into next_number
  from public.quotations q
  where q.business_id = appt.business_id
    and q.quote_number ~ '^Q-(\d+)$';

  quote_number := 'Q-' || lpad(next_number::text, 4, '0');

  insert into public.quotations (
    business_id, branch_id, customer_id, vehicle_id, quote_number, currency, created_by
  )
  values (
    appt.business_id, appt.branch_id, appt.customer_id, appt.vehicle_id, quote_number, 'AED', uid
  )
  returning id into new_quote_id;

  update public.appointments set quotation_id = new_quote_id where id = appt.id;

  return new_quote_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.invoice_credit_notes enable row level security;
alter table public.branch_appointment_settings enable row level security;
alter table public.appointments enable row level security;

create policy "invoices_access" on public.invoices
  for select using (
    public.is_business_member(business_id)
    or public.is_customer_for_business(business_id, customer_id)
  );

create policy "invoices_staff_manage" on public.invoices
  for all using (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]))
  with check (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]));

create policy "invoice_items_staff_manage" on public.invoice_items
  for all using (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]))
  with check (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]));

create policy "invoice_items_customer_read" on public.invoice_items
  for select using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and public.is_customer_for_business(i.business_id, i.customer_id)
        and i.status <> 'draft'
    )
  );

create policy "invoice_payments_staff_manage" on public.invoice_payments
  for all using (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]))
  with check (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]));

create policy "invoice_payments_customer_read" on public.invoice_payments
  for select using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and public.is_customer_for_business(i.business_id, i.customer_id)
    )
  );

create policy "invoice_credit_notes_staff_manage" on public.invoice_credit_notes
  for all using (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]))
  with check (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]));

create policy "invoice_credit_notes_customer_read" on public.invoice_credit_notes
  for select using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and public.is_customer_for_business(i.business_id, i.customer_id)
    )
  );

create policy "branch_appointment_settings_staff_manage" on public.branch_appointment_settings
  for all using (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]))
  with check (public.has_business_role(business_id, array['business_owner', 'manager']::public.member_role[]));

create policy "appointments_access" on public.appointments
  for select using (
    public.is_business_member(business_id)
    or public.is_customer_for_business(business_id, customer_id)
  );

create policy "appointments_staff_manage" on public.appointments
  for all using (public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[]))
  with check (public.has_business_role(business_id, array['business_owner', 'manager', 'employee']::public.member_role[]));

-- Customer self-serve request: every state field is locked to its default
-- "just requested" shape so a customer can't insert a pre-confirmed or
-- pre-declined row. Mirrors complaints_customer_insert (0006).
create policy "appointments_customer_insert" on public.appointments
  for insert with check (
    public.is_customer_for_business(business_id, customer_id)
    and created_by = (select auth.uid())
    and status = 'requested'
    and confirmed_start is null
    and confirmed_end is null
    and decline_reason is null
    and quotation_id is null
    and cancelled_by is null
  );

-- ---------------------------------------------------------------------------
-- Grants (local/self-hosted Postgres does not auto-grant like hosted
-- Supabase -- see 0003_api_grants.sql for why this is required).
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on
  public.invoices,
  public.invoice_items,
  public.invoice_payments,
  public.invoice_credit_notes,
  public.branch_appointment_settings,
  public.appointments
  to authenticated;

grant execute on function
  public.issue_invoice(uuid),
  public.void_invoice(uuid, text),
  public.create_invoice_credit_note(uuid, numeric, text),
  public.confirm_appointment(uuid, timestamptz, timestamptz),
  public.decline_appointment(uuid, text),
  public.cancel_appointment(uuid),
  public.convert_appointment_to_quotation(uuid)
  to authenticated;
