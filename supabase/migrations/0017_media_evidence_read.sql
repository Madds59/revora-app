-- Let a customer read the media_assets rows linked to evidence on their own
-- complaints (the base policies only covered members + linked documents). The
-- actual file bytes are still served via short-lived signed URLs generated
-- server-side; this just exposes the row metadata (object_path, file name).

create policy "media_assets_customer_read_evidence" on public.media_assets
  for select using (
    exists (
      select 1
      from public.complaint_evidence ce
      join public.complaints c on c.id = ce.complaint_id
      where ce.media_asset_id = media_assets.id
        and public.is_customer_for_business(c.business_id, c.customer_id)
    )
  );
