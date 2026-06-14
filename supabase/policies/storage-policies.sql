-- Supabase Storage policy draft for Revora.
-- Create buckets first in Supabase Dashboard or CLI:
--   revora-private
--   revora-public

create policy "private_objects_read_members"
on storage.objects
for select
using (
  bucket_id = 'revora-private'
  and exists (
    select 1
    from public.media_assets ma
    where ma.bucket = storage.objects.bucket_id
      and ma.object_path = storage.objects.name
      and public.is_business_member(ma.business_id)
  )
);

create policy "private_objects_insert_members"
on storage.objects
for insert
with check (
  bucket_id = 'revora-private'
  and exists (
    select 1
    from public.business_members bm
    where bm.user_id = (select auth.uid())
      and bm.is_active = true
      and storage.objects.name like bm.business_id::text || '/%'
  )
);

create policy "public_brand_assets_read"
on storage.objects
for select
using (bucket_id = 'revora-public');

create policy "public_brand_assets_insert_members"
on storage.objects
for insert
with check (
  bucket_id = 'revora-public'
  and exists (
    select 1
    from public.business_members bm
    where bm.user_id = (select auth.uid())
      and bm.is_active = true
      and storage.objects.name like bm.business_id::text || '/%'
  )
);

-- Customer evidence access should normally be served through signed URLs after a
-- database authorization check. This avoids exposing raw private object paths.
