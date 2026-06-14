-- Digital approval with an optional drawn signature image.
--
-- The customer draws a signature, it's uploaded to revora-private, then this
-- SECURITY DEFINER RPC (authorized as the linked customer) optionally records
-- the signature media_asset and inserts the approval with signature_asset_id.
-- media_assets is member-insert-only under RLS, hence the definer path. The
-- existing approvals_create_job trigger (0015) still fires on the insert.

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
  v_business uuid;
  v_customer uuid;
  v_sig_media uuid;
  v_approval uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select business_id, customer_id into v_business, v_customer
  from public.quotations where id = p_quotation_id;
  if v_business is null then
    raise exception 'quotation not found' using errcode = '22023';
  end if;

  if not public.is_customer_for_business(v_business, v_customer) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_signature_object_path is not null then
    insert into public.media_assets (
      business_id, bucket, object_path, file_name, mime_type, size_bytes,
      purpose, visibility, uploaded_by
    )
    values (
      v_business, 'revora-private', p_signature_object_path, 'signature.png',
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
    v_business, p_quotation_id, v_customer, p_quotation_version, p_language,
    p_acknowledgement_text, v_sig_media, p_user_agent,
    jsonb_build_object('signed_name', p_signed_name, 'customer_note', p_customer_note)
  )
  returning id into v_approval;

  return v_approval;
end;
$$;

revoke all on function public.submit_quote_approval(uuid, integer, text, text, text, text, text, text, text, bigint) from public;
grant execute on function public.submit_quote_approval(uuid, integer, text, text, text, text, text, text, text, bigint) to authenticated;
