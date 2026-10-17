-- ===========================================================================
-- One canonical approval path.
--
-- THE PROBLEM (APPSEC-19)
-- Two independent ways to record a quote approval existed:
--
--   1. public.submit_quote_approval() -- added in 0018 for the drawn-signature
--      flow. Correct by construction: it derives business_id and customer_id
--      FROM THE QUOTATION and verifies the caller is that quotation's customer,
--      so the client cannot choose whose approval it is. It was dead code: the
--      only reference anywhere in the repository was the generated type.
--
--   2. A direct INSERT into public.approvals from the portal server action.
--      Live, and hardened at the application layer (APPSEC-11) by re-reading
--      the quotation and inserting the row's identity from that read -- but
--      hardened only there. 0003_api_grants.sql grants INSERT on every public
--      table to `authenticated`, so PostgREST accepted the same insert with no
--      server action involved at all.
--
-- Two paths with different guarantees is itself the defect: a reviewer
-- checking the server action sees a safe flow, while the actual privilege
-- surface is the table. It also silently dropped the signature -- the portal
-- form collects a typed name only, and nothing ever populated
-- approvals.signature_asset_id, so 0018's evidence capture was unreachable.
--
-- THE FIX
--   * Repair the RPC so it enforces everything the server action enforced:
--     quote state and quote version, not just identity.
--   * Make it the ONLY path, by revoking INSERT on public.approvals from
--     `authenticated`. After this the table cannot be written from PostgREST
--     or from a server action's user-scoped client; the SECURITY DEFINER RPC,
--     owned by postgres, remains able to insert.
--   * Keep the RLS policy in place regardless: it is the backstop if the grant
--     is ever widened again, and it still governs SELECT.
--
-- Migration 0039 already made a cross-tenant approval unrepresentable. This
-- migration is about there being one reviewable door, with the state machine
-- enforced behind it rather than in a form handler.
-- ===========================================================================

create or replace function public.submit_quote_approval(
  p_quotation_id uuid,
  p_quotation_version integer,
  p_language text,
  p_acknowledgement_text text,
  p_signed_name text,
  p_customer_note text default null,
  p_user_agent text default null,
  p_signature_object_path text default null,
  p_signature_mime text default null,
  p_signature_size bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  q public.quotations%rowtype;
  v_sig_media uuid;
  v_approval uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Identity comes from the quotation, never from a parameter. There is no
  -- p_business_id or p_customer_id to forge.
  select * into q from public.quotations where id = p_quotation_id;
  if not found then
    raise exception 'quotation not found' using errcode = '22023';
  end if;

  -- The caller must be the portal customer this quotation was issued to.
  if not public.is_customer_for_business(q.business_id, q.customer_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- State machine, enforced here rather than only in the form handler. Without
  -- these two checks, moving the portal onto this RPC would have LOST the
  -- protections the direct-insert path had.
  if q.status not in ('sent', 'revised') then
    raise exception 'quotation is not awaiting approval (status=%)', q.status
      using errcode = '22023';
  end if;

  if p_quotation_version is distinct from q.current_version then
    raise exception
      'quotation version mismatch: approving version % but current version is %',
      p_quotation_version, q.current_version
      using errcode = '22023';
  end if;

  -- One approval per quotation version: re-submitting the same form, or
  -- replaying the request, must not stack approvals on one quote.
  if exists (
    select 1 from public.approvals a
    where a.quotation_id = q.id and a.quotation_version = q.current_version
  ) then
    raise exception 'this quotation version has already been approved'
      using errcode = '23505';
  end if;

  -- Optional drawn-signature evidence. media_assets is member-insert-only
  -- under RLS, which is why this runs in a definer context.
  if p_signature_object_path is not null then
    insert into public.media_assets (
      business_id, bucket, object_path, file_name, mime_type, size_bytes,
      purpose, visibility, uploaded_by
    )
    values (
      q.business_id, 'revora-private', p_signature_object_path, 'signature.png',
      coalesce(p_signature_mime, 'image/png'), coalesce(p_signature_size, 0),
      'signature', 'private', uid
    )
    returning id into v_sig_media;
  end if;

  insert into public.approvals (
    business_id, quotation_id, customer_id, quotation_version, language,
    acknowledgement_text, signature_asset_id, user_agent, device_data
  )
  values (
    q.business_id, q.id, q.customer_id, q.current_version, p_language,
    p_acknowledgement_text, v_sig_media, p_user_agent,
    jsonb_build_object(
      'signed_name', p_signed_name,
      'signed_by', uid,
      'customer_note', p_customer_note
    )
  )
  returning id into v_approval;

  return v_approval;
end;
$$;

comment on function public.submit_quote_approval(uuid, integer, text, text, text, text, text, text, text, bigint) is
  'The canonical quote-approval path. Derives tenant and customer from the quotation, verifies the caller is that customer, enforces quote state, version and single-approval-per-version, and records optional signature evidence. public.approvals has no INSERT grant for authenticated: this function is the only write door (APPSEC-19).';

revoke all on function public.submit_quote_approval(uuid, integer, text, text, text, text, text, text, text, bigint) from public;
grant execute on function public.submit_quote_approval(uuid, integer, text, text, text, text, text, text, text, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Close the second door.
--
-- 0003 granted INSERT on every public table to `authenticated`, and
-- `alter default privileges` keeps doing so for new tables -- so this revoke
-- is specific to approvals and must be re-stated if that blanket grant is ever
-- replayed. The RLS policy stays as the backstop.
--
-- UPDATE and DELETE were never granted a policy, so RLS already denied them;
-- revoking the privilege as well means the attempt is refused before any
-- policy is consulted. An issued approval is evidence: it is written once by
-- the RPC and never edited.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.approvals from authenticated;
revoke insert, update, delete on public.approvals from anon;

comment on table public.approvals is
  'Customer approval of a specific quotation version. Append-only evidence: written exclusively by public.submit_quote_approval(); authenticated holds SELECT only (APPSEC-19).';
