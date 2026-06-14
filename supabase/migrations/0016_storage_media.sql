-- File uploads & media (Supabase Storage).
--
-- Buckets: revora-private (evidence, signatures, documents) and revora-public
-- (brand logos). Object path convention: <business_id>/<entity>/<uuid>-<name>,
-- so policies authorize by the leading business_id path segment.
--
-- Uploads are direct from the browser (the user's JWT), so storage.objects RLS
-- must allow both staff (business members) and the relevant customer. Private
-- READS are served via short-lived signed URLs generated server-side with the
-- service role after the app's own RLS-backed authorization, so we keep the
-- private SELECT policy narrow (members only).

insert into storage.buckets (id, name, public)
values ('revora-private', 'revora-private', false),
       ('revora-public', 'revora-public', true)
on conflict (id) do nothing;

-- INSERT: members of the business in the path, OR a customer of that business.
create policy "revora_private_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'revora-private'
  and (
    exists (
      select 1 from public.business_members bm
      where bm.user_id = (select auth.uid())
        and bm.is_active
        and bm.business_id::text = split_part(name, '/', 1)
    )
    or exists (
      select 1 from public.customers c
      where c.app_user_id = (select auth.uid())
        and c.deleted_at is null
        and c.business_id::text = split_part(name, '/', 1)
    )
  )
);

-- SELECT (private): business members. Customers get signed URLs from the server.
create policy "revora_private_read_members"
on storage.objects for select to authenticated
using (
  bucket_id = 'revora-private'
  and exists (
    select 1 from public.business_members bm
    where bm.user_id = (select auth.uid())
      and bm.is_active
      and bm.business_id::text = split_part(name, '/', 1)
  )
);

-- Public brand assets: world-readable; only members may upload for their business.
create policy "revora_public_read"
on storage.objects for select
using (bucket_id = 'revora-public');

create policy "revora_public_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'revora-public'
  and exists (
    select 1 from public.business_members bm
    where bm.user_id = (select auth.uid())
      and bm.is_active
      and bm.business_id::text = split_part(name, '/', 1)
  )
);

-- Record complaint evidence. media_assets is member-insert-only under RLS, but a
-- customer must be able to attach evidence to their own complaint, so this
-- SECURITY DEFINER function inserts the media_asset + complaint_evidence rows
-- after authorizing the caller (member of the business or the complaint's customer).
create or replace function public.record_complaint_evidence(
  p_complaint_id uuid,
  p_object_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_description text default null
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
  v_media uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select business_id, customer_id into v_business, v_customer
  from public.complaints where id = p_complaint_id;
  if v_business is null then
    raise exception 'complaint not found' using errcode = '22023';
  end if;

  if not (
    public.is_business_member(v_business)
    or public.is_customer_for_business(v_business, v_customer)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.media_assets (
    business_id, bucket, object_path, file_name, mime_type, size_bytes,
    purpose, visibility, uploaded_by
  )
  values (
    v_business, 'revora-private', p_object_path, p_file_name, p_mime_type,
    p_size_bytes, 'complaint_evidence', 'private', uid
  )
  returning id into v_media;

  insert into public.complaint_evidence (
    business_id, complaint_id, media_asset_id, description, uploaded_by
  )
  values (v_business, p_complaint_id, v_media, p_description, uid);

  return v_media;
end;
$$;

revoke all on function public.record_complaint_evidence(uuid, text, text, text, bigint, text) from public;
grant execute on function public.record_complaint_evidence(uuid, text, text, text, bigint, text) to authenticated;
