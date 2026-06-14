-- Let business members read each other's profiles (names) within a shared
-- business. The base profiles policy is self-only, which hides teammate names
-- on the Team screen. This stays tenant-scoped: you can only see profiles of
-- people who share an active membership in one of your businesses.

create policy "profiles_select_comembers" on public.profiles
  for select using (
    exists (
      select 1
      from public.business_members bm_self
      join public.business_members bm_other
        on bm_other.business_id = bm_self.business_id
      where bm_self.user_id = (select auth.uid())
        and bm_self.is_active
        and bm_other.user_id = profiles.id
        and bm_other.is_active
    )
  );
