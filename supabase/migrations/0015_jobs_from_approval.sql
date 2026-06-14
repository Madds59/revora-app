-- Close the operational loop: when a customer approves a quote, mark the quote
-- approved and create the work-order (job) from it.
--
-- Approvals are inserted by the customer (RLS approvals_customer_insert), and
-- customers cannot insert jobs/quotation-status updates. This SECURITY DEFINER
-- trigger runs as the table owner so the approval can drive both side effects.
-- Idempotent: it only creates a job if one doesn't already exist for the quote.

create or replace function public.handle_quote_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.quotations%rowtype;
  new_job_id uuid;
begin
  select * into q from public.quotations where id = new.quotation_id;
  if not found then
    return new;
  end if;

  -- Authoritative status flip (was previously only derived in the UI).
  update public.quotations
    set status = 'approved'
    where id = q.id
      and status in ('sent', 'revised');

  -- Create the job once per quotation.
  if not exists (
    select 1 from public.jobs where quotation_id = q.id
  ) then
    insert into public.jobs (
      business_id, quotation_id, customer_id, branch_id,
      status, title, expected_completion_at, created_by
    )
    values (
      q.business_id, q.id, q.customer_id, q.branch_id,
      'approved',
      'Work for ' || q.quote_number,
      case
        when q.expected_completion_date is not null
        then q.expected_completion_date::timestamptz
        else null
      end,
      q.created_by
    )
    returning id into new_job_id;

    insert into public.job_updates (
      business_id, job_id, status, message, visible_to_customer, created_by
    )
    values (
      q.business_id, new_job_id, 'approved',
      'Job created from approved quotation ' || q.quote_number,
      true, q.created_by
    );
  end if;

  return new;
end;
$$;

drop trigger if exists approvals_create_job on public.approvals;
create trigger approvals_create_job
  after insert on public.approvals
  for each row execute function public.handle_quote_approved();
