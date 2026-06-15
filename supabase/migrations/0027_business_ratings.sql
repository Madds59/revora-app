create table if not exists public.business_ratings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  rating integer not null check (rating >= 1 and rating <= 5),
  review text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, customer_id)
);

create index if not exists business_ratings_business_id_idx
  on public.business_ratings (business_id, created_at desc);

create index if not exists business_ratings_customer_id_idx
  on public.business_ratings (customer_id, created_at desc);

alter table public.business_ratings enable row level security;

drop trigger if exists set_business_ratings_updated_at on public.business_ratings;
create trigger set_business_ratings_updated_at
before update on public.business_ratings
for each row execute function public.set_updated_at();

drop policy if exists "business ratings select" on public.business_ratings;
create policy "business ratings select"
  on public.business_ratings
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.business_members bm
      where bm.business_id = business_ratings.business_id
        and bm.user_id = auth.uid()
        and bm.is_active = true
    )
    or exists (
      select 1
      from public.customers c
      where c.id = business_ratings.customer_id
        and c.business_id = business_ratings.business_id
        and c.app_user_id = auth.uid()
        and c.deleted_at is null
    )
  );

drop policy if exists "business ratings insert" on public.business_ratings;
create policy "business ratings insert"
  on public.business_ratings
  for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or exists (
      select 1
      from public.customers c
      where c.id = business_ratings.customer_id
        and c.business_id = business_ratings.business_id
        and c.app_user_id = auth.uid()
        and c.deleted_at is null
    )
  );

drop policy if exists "business ratings update" on public.business_ratings;
create policy "business ratings update"
  on public.business_ratings
  for update
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.customers c
      where c.id = business_ratings.customer_id
        and c.business_id = business_ratings.business_id
        and c.app_user_id = auth.uid()
        and c.deleted_at is null
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1
      from public.customers c
      where c.id = business_ratings.customer_id
        and c.business_id = business_ratings.business_id
        and c.app_user_id = auth.uid()
        and c.deleted_at is null
    )
  );
