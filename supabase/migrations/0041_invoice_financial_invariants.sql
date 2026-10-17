-- ===========================================================================
-- Invoice financial invariants (APPSEC-20).
--
-- WHERE THE SOURCE OF TRUTH WAS SPLIT
-- Two of the four header money columns were already database-authoritative:
--
--     amount_paid   maintained by recompute_invoice_paid_status() (0034)
--     balance_due   GENERATED ALWAYS AS (total - amount_paid)
--
-- The other four -- subtotal, discount_total, tax_total, total -- were plain
-- columns with no trigger on invoice_items at all. They were maintained by
-- recomputeTotals() in apps/web/src/app/[locale]/(dashboard)/invoices/actions.ts,
-- which only runs when that action runs. 0003_api_grants.sql grants INSERT,
-- UPDATE and DELETE on invoice_items to `authenticated`, so an owner or manager
-- posting straight at PostgREST could add, re-price or remove a line and leave
-- the header totals -- and therefore balance_due, which is derived from them --
-- stale. The same split hid two further defects:
--
--   * OVERPAYMENT. recompute_invoice_paid_status() sets amount_paid to the sum
--     of payments with no ceiling, so paying 2000 against a 1000 invoice left
--     balance_due at -1000 and the status at `paid`. Nothing in the schema can
--     hold a customer credit balance, so a negative balance is not a feature
--     here; it is an unrepresentable state being represented.
--
--   * CREDIT NOTES WITHOUT EFFECT OR CEILING. create_invoice_credit_note()
--     (0034) validates the actor and the invoice state, allocates a number and
--     inserts the row -- and then touches nothing else. Credits neither reduce
--     what is owed nor are capped, so an unlimited amount could be credited
--     against any issued invoice.
--
--   * ISSUED INVOICES WERE EDITABLE. The application enforces "Only draft
--     invoices can be edited" (invoices/actions.ts), which is the correct rule
--     and the reason credit notes exist -- but it enforced it only in the
--     action.
--
-- WHAT THIS MIGRATION DOES
-- Moves all four header totals, and the line total, to one database-owned
-- source of truth, and refuses the invalid states above. It encodes the
-- arithmetic ALREADY in apps/web/src/lib/money.ts exactly -- per line
-- gross = quantity * unit_price, net = gross - discount_amount,
-- tax = net * tax_rate / 100 -- so this is a relocation of the existing rule,
-- not a new accounting policy.
--
-- WHAT IT DELIBERATELY DOES NOT DECIDE
-- Whether a credit note REDUCES the balance owed or is a separate refundable
-- instrument is an accounting and UAE-FTA question, not an integrity one, and
-- `balance_due` is a generated column whose expression cannot be widened
-- without dropping and recreating it. This migration therefore caps cumulative
-- credits at the invoice total (pure integrity, uncontroversial) and leaves the
-- balance effect to an explicit owner decision. See
-- docs/security/MIGRATION_RELEASE_SOP.md.
--
-- FORWARD-ONLY. Adds triggers, constraints and functions; drops no column and
-- deletes no row.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Census.
--
-- Totals that already disagree with their lines, and invoices already overpaid.
-- Reported as a NOTICE rather than an exception: unlike a cross-tenant row, a
-- stale total is not corruption that must block a security fix -- the triggers
-- below correct it on the next write, and the recompute at the end of this
-- migration corrects it now. Raising here would block the fix on the very
-- drift the fix exists to remove.
-- ---------------------------------------------------------------------------
do $census$
declare
  stale bigint;
  overpaid bigint;
  overcredited bigint;
begin
  select count(*) into stale
  from public.invoices i
  left join (
    select invoice_id,
           round(sum(quantity * unit_price), 2) as subtotal,
           round(sum(discount_amount), 2) as discount_total,
           round(sum((quantity * unit_price - discount_amount) * tax_rate / 100.0), 2) as tax_total
    from public.invoice_items group by invoice_id
  ) l on l.invoice_id = i.id
  where coalesce(i.subtotal, 0) is distinct from coalesce(l.subtotal, 0)
     or coalesce(i.discount_total, 0) is distinct from coalesce(l.discount_total, 0)
     or coalesce(i.tax_total, 0) is distinct from coalesce(l.tax_total, 0);

  select count(*) into overpaid from public.invoices where amount_paid > total;

  select count(*) into overcredited
  from public.invoices i
  join (
    select invoice_id, sum(amount) as credited
    from public.invoice_credit_notes group by invoice_id
  ) c on c.invoice_id = i.id
  where c.credited > i.total;

  raise notice
    'APPSEC-20 census: % invoice(s) with header totals disagreeing with their lines, % overpaid, % over-credited.',
    stale, overpaid, overcredited;
end
$census$;

-- ---------------------------------------------------------------------------
-- 1. The line and header arithmetic, in one place.
--
-- Mirrors computeLine/computeTotals in apps/web/src/lib/money.ts. Rounding is
-- applied to the aggregate, not per line, which is what the TypeScript does.
-- numeric is exact, so there is no float drift to reconcile between them.
-- ---------------------------------------------------------------------------
create or replace function public.invoice_line_total(
  p_quantity numeric,
  p_unit_price numeric,
  p_discount_amount numeric,
  p_tax_rate numeric
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select round(
    (coalesce(p_quantity, 0) * coalesce(p_unit_price, 0) - coalesce(p_discount_amount, 0))
    * (1 + coalesce(p_tax_rate, 0) / 100.0), 2);
$$;

comment on function public.invoice_line_total(numeric, numeric, numeric, numeric) is
  'Per-line invoice total: (quantity * unit_price - discount) * (1 + tax_rate/100). Mirrors computeLine() in apps/web/src/lib/money.ts.';

-- Recomputes one invoice header from its lines. SECURITY DEFINER because the
-- caller mutating a line is a manager whose own RLS permits the invoice UPDATE,
-- but the recompute must also succeed on any future path (service_role, an
-- RPC, a cron correction) without depending on the caller's policies.
create or replace function public.recompute_invoice_totals(target_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  select
    coalesce(round(sum(quantity * unit_price), 2), 0) as subtotal,
    coalesce(round(sum(discount_amount), 2), 0) as discount_total,
    coalesce(round(sum((quantity * unit_price - discount_amount) * tax_rate / 100.0), 2), 0) as tax_total
  into t
  from public.invoice_items
  where invoice_id = target_invoice_id;

  update public.invoices
    set subtotal = t.subtotal,
        discount_total = t.discount_total,
        tax_total = t.tax_total,
        total = round(t.subtotal - t.discount_total + t.tax_total, 2)
    where id = target_invoice_id;
end;
$$;

comment on function public.recompute_invoice_totals(uuid) is
  'Rebuilds an invoice header subtotal/discount_total/tax_total/total from its invoice_items. The single source of truth for those four columns (APPSEC-20).';

-- ---------------------------------------------------------------------------
-- 2. Line total is derived, never supplied.
-- ---------------------------------------------------------------------------
create or replace function public.set_invoice_item_total()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.total := public.invoice_line_total(
    new.quantity, new.unit_price, new.discount_amount, new.tax_rate
  );
  return new;
end;
$$;

drop trigger if exists invoice_items_set_total on public.invoice_items;
create trigger invoice_items_set_total
  before insert or update on public.invoice_items
  for each row execute function public.set_invoice_item_total();

-- ---------------------------------------------------------------------------
-- 3. An issued invoice's lines are immutable.
--
-- This is the application's existing rule ("Only draft invoices can be
-- edited"), moved to where PostgREST cannot step around it. A correction to an
-- issued invoice is a credit note, which is why create_invoice_credit_note()
-- exists.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_invoice_items_draft_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  inv_status public.invoice_status;
begin
  select status into inv_status from public.invoices where id = target_invoice_id;
  if inv_status is null then
    return coalesce(new, old);
  end if;

  if inv_status <> 'draft' then
    raise exception
      'invoice lines cannot be changed once the invoice is %; issue a credit note instead',
      inv_status
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists invoice_items_draft_only on public.invoice_items;
create trigger invoice_items_draft_only
  before insert or update or delete on public.invoice_items
  for each row execute function public.enforce_invoice_items_draft_only();

-- ---------------------------------------------------------------------------
-- 4. Header totals follow the lines, on every path.
-- ---------------------------------------------------------------------------
create or replace function public.invoice_items_recompute_header()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_invoice_totals(coalesce(new.invoice_id, old.invoice_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists invoice_items_recompute on public.invoice_items;
create trigger invoice_items_recompute
  after insert or update or delete on public.invoice_items
  for each row execute function public.invoice_items_recompute_header();

-- ---------------------------------------------------------------------------
-- 5. Payments cannot exceed what is owed.
--
-- BEFORE INSERT/UPDATE, so the row is refused rather than recorded and then
-- compensated. `for update` on the invoice row serialises concurrent payments:
-- two simultaneous payments that are each individually valid but jointly an
-- overpayment cannot both pass, because the second waits for the first to
-- commit before it sums.
--
-- Void invoices accept no payment at all. Drafts are left payable, which is
-- the behaviour recompute_invoice_paid_status() already implied by preserving
-- the `draft` status -- narrowing that is a product decision, not an integrity
-- fix.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_invoice_payment_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  already numeric(12,2);
  proposed numeric(12,2);
begin
  if new.amount is null or new.amount <= 0 then
    raise exception 'payment amount must be positive' using errcode = '22023';
  end if;

  select * into inv from public.invoices where id = new.invoice_id for update;
  if not found then
    raise exception 'invoice not found' using errcode = '22023';
  end if;

  if inv.status = 'void' then
    raise exception 'a void invoice cannot take payments' using errcode = '22023';
  end if;

  select coalesce(sum(p.amount), 0) into already
  from public.invoice_payments p
  where p.invoice_id = new.invoice_id
    and (tg_op = 'INSERT' or p.id <> new.id);

  proposed := already + new.amount;

  if proposed > inv.total then
    raise exception
      'payment of % would exceed the invoice total (% already paid of %); overpayment is not supported',
      new.amount, already, inv.total
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.enforce_invoice_payment_ceiling() is
  'Refuses a payment that would push cumulative payments past the invoice total, locking the invoice row so concurrent payments cannot jointly overpay (APPSEC-20).';

drop trigger if exists invoice_payments_ceiling on public.invoice_payments;
create trigger invoice_payments_ceiling
  before insert or update on public.invoice_payments
  for each row execute function public.enforce_invoice_payment_ceiling();

-- Belt-and-braces: even if a future path writes amount_paid directly, the row
-- cannot record more paid than the invoice is worth, and balance_due
-- (generated from these two) cannot go negative.
alter table public.invoices
  drop constraint if exists invoices_amount_paid_within_total;
alter table public.invoices
  add constraint invoices_amount_paid_within_total
  check (amount_paid >= 0 and amount_paid <= total) not valid;

-- NOT VALID so the constraint governs new and updated rows immediately without
-- failing on pre-existing drift; validated below once the data is corrected.

-- ---------------------------------------------------------------------------
-- 6. Cumulative credit notes cannot exceed the invoice total.
--
-- Same body as 0034 plus the ceiling, and the advisory lock now also protects
-- the ceiling check (it previously only serialised number allocation).
-- ---------------------------------------------------------------------------
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
  already numeric(12,2);
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

  -- The ceiling. Without it any amount could be credited any number of times.
  select coalesce(sum(c.amount), 0) into already
  from public.invoice_credit_notes c
  where c.invoice_id = inv.id;

  if already + amount > inv.total then
    raise exception
      'credit note of % would exceed the invoice total (% already credited of %)',
      amount, already, inv.total
      using errcode = '23514';
  end if;

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

comment on function public.create_invoice_credit_note(uuid, numeric, text) is
  'Issues a credit note against an issued invoice. Caps cumulative credits at the invoice total (APPSEC-20). Does NOT yet reduce balance_due: whether a credit note reduces the amount owed or is a separate refundable instrument is an open accounting decision.';

-- Credit-note rows are evidence; a negative credit is not meaningful.
alter table public.invoice_credit_notes
  drop constraint if exists invoice_credit_notes_amount_positive;
alter table public.invoice_credit_notes
  add constraint invoice_credit_notes_amount_positive check (amount > 0) not valid;

-- ---------------------------------------------------------------------------
-- 7. Correct existing drift, then validate the constraints.
--
-- Recompute every invoice header from its lines. This is the one place the
-- totals are rewritten in bulk; from here the triggers keep them true.
-- ---------------------------------------------------------------------------
do $backfill$
declare
  r record;
  fixed integer := 0;
begin
  for r in select id from public.invoices loop
    perform public.recompute_invoice_totals(r.id);
    fixed := fixed + 1;
  end loop;
  raise notice 'APPSEC-20: recomputed % invoice header(s) from their lines.', fixed;
end
$backfill$;

-- Validate now that the data has been corrected. If an invoice is genuinely
-- overpaid in production this VALIDATE fails loudly, which is the right
-- outcome: it needs a refund or a reviewed decision, not a silent pass.
alter table public.invoices validate constraint invoices_amount_paid_within_total;
alter table public.invoice_credit_notes validate constraint invoice_credit_notes_amount_positive;
